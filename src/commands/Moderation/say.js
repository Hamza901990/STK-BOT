// say.js
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { logModerationAction } from './moderation.js';
import { logger } from './logger.js';

export const data = new SlashCommandBuilder()
  .setName('say')
  .setDescription('Make the bot send a message as itself')
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('The message to send')
      .setRequired(true)
      .setMaxLength(2000)
  )
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('Channel to send the message in (defaults to current channel)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export async function execute(interaction) {
  const message = interaction.options.getString('message', true);
  const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

  // Permission / sanity checks
  if (!targetChannel?.isTextBased?.()) {
    return interaction.reply({
      content: 'That channel is not a text channel I can send messages in.',
      ephemeral: true,
    });
  }

  const botMember = interaction.guild.members.me;
  if (!targetChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages)) {
    return interaction.reply({
      content: `I don't have permission to send messages in ${targetChannel}.`,
      ephemeral: true,
    });
  }

  try {
    await targetChannel.send({ content: message });

    await interaction.reply({
      content: `Message sent in ${targetChannel}.`,
      ephemeral: true,
    });

    // Build target/executor strings in the "Tag (id)" shape that
    // moderation.js's buildModerationLogData() expects, so the
    // regex-based id extraction (and thumbnail lookup) works.
    const executorString = `${interaction.user.tag} (${interaction.user.id})`;

    await logModerationAction({
      client: interaction.client,
      guild: interaction.guild,
      event: {
        action: 'Bot Message Sent',
        target: executorString,
        executor: executorString,
        reason: message.length > 900 ? `${message.slice(0, 897)}...` : message,
        metadata: {
          userId: interaction.user.id,
          moderatorId: interaction.user.id,
          channelId: targetChannel.id,
          channel: `#${targetChannel.name}`,
        },
      },
    });
  } catch (error) {
    logger.error('Error executing /say command:', error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'Something went wrong sending that message.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: 'Something went wrong sending that message.',
        ephemeral: true,
      });
    }
  }
}
