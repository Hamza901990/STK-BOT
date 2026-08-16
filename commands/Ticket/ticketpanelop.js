import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { saveTicketPanelOpData } from '../../utils/database/ticketPanelOp.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes, createError } from '../../utils/errorHandler.js';

const TYPE_EMOJIS = ['🎫', '📋', '💬', '🛠️', '⚠️'];
const HEX_COLOR_REGEX = /^#?[0-9a-fA-F]{6}$/;

function addTypeOptionPair(subcommand, index, required) {
  subcommand
    .addStringOption((option) =>
      option
        .setName(`type${index}_name`)
        .setDescription(`Name shown in the dropdown for ticket type ${index} (e.g. "Billing Support")`)
        .setMaxLength(80)
        .setRequired(required),
    )
    .addRoleOption((option) =>
      option
        .setName(`type${index}_role`)
        .setDescription(`Support role pinged/given access for ticket type ${index}`)
        .setRequired(required),
    );
  return subcommand;
}

export default {
  data: (() => {
    const builder = new SlashCommandBuilder()
      .setName('ticketpanelop')
      .setDescription('Creates a professional support-ticket panel with a customizable dropdown menu.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .setDMPermission(false)
      .addSubcommand((subcommand) => {
        subcommand
          .setName('setup')
          .setDescription('Posts a new ticket panel with a dropdown of ticket types.')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('The channel where the ticket panel will be posted.')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true),
          )
          .addStringOption((option) =>
            option.setName('title').setDescription('Title for the ticket panel embed.').setMaxLength(256).setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName('description')
              .setDescription('Description for the ticket panel embed.')
              .setMaxLength(2000)
              .setRequired(true),
          );

        addTypeOptionPair(subcommand, 1, true);
        addTypeOptionPair(subcommand, 2, false);
        addTypeOptionPair(subcommand, 3, false);
        addTypeOptionPair(subcommand, 4, false);
        addTypeOptionPair(subcommand, 5, false);

        subcommand
          .addChannelOption((option) =>
            option
              .setName('category')
              .setDescription('Category where new tickets from this panel will be created (optional).')
              .addChannelTypes(ChannelType.GuildCategory)
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName('color')
              .setDescription('Hex color for the panel embed, e.g. #5865F2 (optional).')
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName('placeholder')
              .setDescription('Placeholder text shown on the dropdown (default: "Select a ticket type...").')
              .setMaxLength(100)
              .setRequired(false),
          );

        return subcommand;
      });

    return builder;
  })(),

  async execute(interaction, guildConfig, client) {
    const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) return;

    try {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand !== 'setup') return;

      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the `Manage Channels` permission to set up a ticket panel.' });
      }

      const channel = interaction.options.getChannel('channel');
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const category = interaction.options.getChannel('category');
      const colorInput = interaction.options.getString('color');
      const placeholder = interaction.options.getString('placeholder') || 'Select a ticket type...';

      if (colorInput && !HEX_COLOR_REGEX.test(colorInput)) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Color must be a valid hex code, e.g. `#5865F2`.' });
      }

      const types = [];
      const seenNames = new Set();
      for (let i = 1; i <= 5; i += 1) {
        const name = interaction.options.getString(`type${i}_name`);
        const role = interaction.options.getRole(`type${i}_role`);
        if (!name || !role) continue;

        const key = name.trim().toLowerCase();
        if (seenNames.has(key)) {
          return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `Ticket type names must be unique. "${name}" is used more than once.` });
        }
        seenNames.add(key);

        types.push({ name: name.trim(), roleId: role.id, roleName: role.name });
      }

      if (types.length === 0) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'You must provide at least one ticket type (name + support role).' });
      }

      const panelEmbed = createEmbed({
        title,
        description,
        color: colorInput ? (colorInput.startsWith('#') ? colorInput : `#${colorInput}`) : 'info',
        fields: [
          {
            name: 'Ticket Types',
            value: types.map((t, i) => `${TYPE_EMOJIS[i] || '🎫'} **${t.name}** — <@&${t.roleId}>`).join('\n'),
          },
        ],
        footer: { text: 'Select an option below to open a ticket' },
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticketpanelop_select')
        .setPlaceholder(placeholder)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          types.map((t, i) => ({
            label: t.name.slice(0, 100),
            description: `Support role: ${t.roleName}`.slice(0, 100),
            value: String(i),
            emoji: TYPE_EMOJIS[i] || '🎫',
          })),
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      let sentPanel;
      try {
        sentPanel = await channel.send({ embeds: [panelEmbed], components: [row] });
      } catch (sendError) {
        throw createError(
          'Failed to send ticket panel',
          ErrorTypes.DISCORD_API,
          `Could not post the panel in ${channel}. Check that the bot can view and send messages there.`,
          { channelId: channel.id, guildId: interaction.guildId },
        );
      }

      await saveTicketPanelOpData(interaction.guildId, sentPanel.id, {
        guildId: interaction.guildId,
        channelId: channel.id,
        messageId: sentPanel.id,
        title,
        description,
        color: colorInput || null,
        categoryId: category?.id || null,
        types,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString(),
      });

      const summaryLines = types.map((t, i) => `${TYPE_EMOJIS[i] || '🎫'} **${t.name}** → <@&${t.roleId}>`).join('\n');

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            'Ticket Panel Created',
            `Your ticket panel is live in ${channel}.\n\n**Ticket Types:**\n${summaryLines}${category ? `\n\n**Ticket Category:** ${category}` : ''}`,
          ),
        ],
      });

      logger.info('Ticket panel (ticketpanelop) created', {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: channel.id,
        messageId: sentPanel.id,
        typeCount: types.length,
      });
    } catch (error) {
      await handleInteractionError(interaction, error, {
        commandName: 'ticketpanelop',
        source: 'ticketpanelop_setup',
      });
    }
  },
};
