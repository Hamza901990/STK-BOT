const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticketpanelop')
        .setDescription('Create a ticket panel with custom title, description, and buttons')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Title of the ticket panel embed')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description of the ticket panel embed')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('Name for ticket button 1')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('Name for ticket button 2')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option3')
                .setDescription('Name for ticket button 3')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option4')
                .setDescription('Name for ticket button 4')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option5')
                .setDescription('Name for ticket button 5')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option6')
                .setDescription('Name for ticket button 6')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option7')
                .setDescription('Name for ticket button 7')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');

        // Collect option1-7, skipping any that weren't provided
        const options = [];
        for (let i = 1; i <= 7; i++) {
            const value = interaction.options.getString(`option${i}`);
            if (value) options.push(value);
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0x2b2d31);

        // Discord allows max 5 buttons per row, so split into rows as needed
        const rows = [];
        let currentRow = new ActionRowBuilder();

        options.forEach((label, index) => {
            if (currentRow.components.length === 5) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }

            // custom_id encodes the button's index + a slugified label
            // so a separate interactionCreate handler can identify which
            // ticket type was clicked (see note below).
            const slug = label
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 60);

            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_open_${index}_${slug}`)
                    .setLabel(label)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        if (currentRow.components.length > 0) rows.push(currentRow);

        await interaction.reply({
            embeds: [embed],
            components: rows
        });
    }
};
