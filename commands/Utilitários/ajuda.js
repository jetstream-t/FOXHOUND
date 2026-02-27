const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const colors = require('../../colors.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ajuda')
        .setDescription('Mostra a lista de comandos e categorias'),

    async execute(interaction) {
        await this.showHelpMenu(interaction);
    },

    async executePrefix(message, args) {
        await this.showHelpMenu(message);
    },

    async showHelpMenu(context) {
        const client = context.client;
        const commands = client.commands;

        // 1. Agrupar comandos por categoria
        const categories = {};
        commands.forEach(cmd => {
            const category = cmd.category || 'Outros';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(cmd);
        });

        // 2. Mapear emojis para categorias conhecidas
        const categoryEmojis = {
            'Economia': '💰',
            'Diversão': '🎲',
            'Moderação': '🛡️',
            'Utilitários': '🛠️',
            'Filmes': '🎬',
            'Outros': '📂'
        };

        // 3. Criar opções do menu
        const options = Object.keys(categories).sort().map(cat => {
            const emoji = categoryEmojis[cat] || '📂';
            const count = categories[cat].length;
            return {
                label: cat,
                description: `${count} comandos disponíveis`,
                value: `help_cat_${cat}`,
                emoji: emoji
            };
        });

        // Adicionar opção "Voltar ao Início"
        options.unshift({
            label: 'Início',
            description: 'Visão geral do bot',
            value: 'help_home',
            emoji: '🏠'
        });

        // 4. Criar Menu de Seleção
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_select')
            .setPlaceholder('Selecione uma categoria...')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // 5. Criar Embed Inicial
        const embed = new EmbedBuilder()
            .setTitle('📚 Central de Ajuda')
            .setDescription(`Olá! Eu sou o **${client.user.username}**.\nUse o menu abaixo para navegar pelas minhas categorias de comandos.`)
            .setColor(colors.default)
            .addFields(
                { name: '🤖 Total de Comandos', value: `${commands.size}`, inline: true },
                { name: '📂 Categorias', value: `${Object.keys(categories).length}`, inline: true },
                { name: '🔗 Links Úteis', value: '[Suporte](https://discord.gg/btjRwnKeKb) • [Vote](https://top.gg/bot/1472012162125005075)', inline: false }
            )
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: 'Selecione uma categoria para ver os comandos.' });

        // Enviar resposta
        const replyMethod = context.reply ? context.reply.bind(context) : context.channel.send.bind(context.channel);
        await replyMethod({ embeds: [embed], components: [row] });
    },

    async handleSelect(interaction) {
        const selected = interaction.values[0];
        const client = interaction.client;
        const commands = client.commands;

        // Recuperar categorias novamente (poderia cachear, mas é rápido o suficiente)
        const categories = {};
        commands.forEach(cmd => {
            const category = cmd.category || 'Outros';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(cmd);
        });

        // Mapeamento de emojis
        const categoryEmojis = {
            'Economia': '💰',
            'Diversão': '🎲',
            'Moderação': '🛡️',
            'Utilitários': '🛠️',
            'Filmes': '🎬',
            'Outros': '📂'
        };

        // Recriar opções para manter o menu funcional
        const options = Object.keys(categories).sort().map(cat => {
            const emoji = categoryEmojis[cat] || '📂';
            const count = categories[cat].length;
            return {
                label: cat,
                description: `${count} comandos disponíveis`,
                value: `help_cat_${cat}`,
                emoji: emoji,
                default: selected === `help_cat_${cat}` // Marcar como selecionado
            };
        });

        options.unshift({
            label: 'Início',
            description: 'Visão geral do bot',
            value: 'help_home',
            emoji: '🏠',
            default: selected === 'help_home'
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_select')
            .setPlaceholder('Selecione uma categoria...')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Lógica de exibição
        if (selected === 'help_home') {
             const embed = new EmbedBuilder()
                .setTitle('📚 Central de Ajuda')
                .setDescription(`Olá! Eu sou o **${client.user.username}**.\nUse o menu abaixo para navegar pelas minhas categorias de comandos.`)
                .setColor(colors.default)
                .addFields(
                    { name: '🤖 Total de Comandos', value: `${commands.size}`, inline: true },
                    { name: '📂 Categorias', value: `${Object.keys(categories).length}`, inline: true }
                )
                .setThumbnail(client.user.displayAvatarURL())
                .setFooter({ text: 'Selecione uma categoria para ver os comandos.' });
            
            await interaction.update({ embeds: [embed], components: [row] });
        } else {
            // Extrair nome da categoria (remove 'help_cat_')
            const catName = selected.replace('help_cat_', '');
            const catCommands = categories[catName];

            if (!catCommands) {
                return interaction.reply({ content: '❌ Categoria não encontrada.', ephemeral: true });
            }

            const emoji = categoryEmojis[catName] || '📂';
            
            const embed = new EmbedBuilder()
                .setTitle(`${emoji} Categoria: ${catName}`)
                .setColor(colors.default)
                .setFooter({ text: `${catCommands.length} comandos nesta categoria.` });

            // Listar comandos
            // Se houver muitos comandos, pode exceder limite de caracteres. Vamos truncar ou paginar se necessário.
            // Para simplificar, vamos listar apenas nomes e descrições curtas.
            
            const descriptionList = catCommands.map(cmd => {
                const desc = cmd.data.description || 'Sem descrição';
                
                // Gerar string de uso (argumentos)
                let usage = '';
                if (cmd.data.options && cmd.data.options.length > 0) {
                    usage = ' ' + cmd.data.options.map(opt => {
                        if (opt.required) return `<${opt.name}>`;
                        return `[${opt.name}]`;
                    }).join(' ');
                }

                return `**/${cmd.data.name}${usage}**\n┗ *${desc}*`;
            }).join('\n\n');

            embed.setDescription(descriptionList);

            await interaction.update({ embeds: [embed], components: [row] });
        }
    }
};
