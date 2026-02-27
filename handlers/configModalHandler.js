const { ModalSubmitInteraction, EmbedBuilder } = require('discord.js');
const db = require('../database');
const colors = require('../colors.json');

class ConfigModalHandler {
    static async handle(interaction) {
        const customId = interaction.customId;

        switch (customId) {
            case 'welcome_title_message_modal':
                await this.handleWelcomeTitleMessage(interaction);
                break;
            case 'welcome_image_modal':
                await this.handleWelcomeImage(interaction);
                break;
            case 'welcome_thumbnail_modal':
                await this.handleWelcomeThumbnail(interaction);
                break;
            case 'welcome_footer_modal':
                await this.handleWelcomeFooter(interaction);
                break;
            case 'welcome_color_modal':
                await this.handleWelcomeColor(interaction);
                break;
            case 'welcome_button_modal':
                await this.handleWelcomeButton(interaction);
                break;
            case 'leave_title_message_modal':
                await this.handleLeaveTitleMessage(interaction);
                break;
            case 'leave_image_modal':
                await this.handleLeaveImage(interaction);
                break;
            case 'leave_thumbnail_modal':
                await this.handleLeaveThumbnail(interaction);
                break;
            case 'leave_footer_modal':
                await this.handleLeaveFooter(interaction);
                break;
            case 'leave_color_modal':
                await this.handleLeaveColor(interaction);
                break;
            default:
                await interaction.reply({ 
                    content: '❌ Modal não reconhecido.', 
                    ephemeral: true 
                });
        }
    }

    static async handleWelcomeTitleMessage(interaction) {
        const title = interaction.fields.getTextInputValue('welcome_title');
        const message = interaction.fields.getTextInputValue('welcome_message');

        const updateData = {};
        if (title) updateData['welcome.title'] = title;
        if (message) updateData['welcome.message'] = message;

        await db.updateGuildConfig(interaction.guildId, updateData);

        await interaction.reply({ 
            content: '✅ Título e mensagem atualizados com sucesso!', 
            ephemeral: true 
        });

        // Atualizar o painel
        await this.updateWelcomePanel(interaction);
    }

    static async handleWelcomeImage(interaction) {
        const imageUrl = interaction.fields.getTextInputValue('welcome_image_url');
        
        if (imageUrl && imageUrl !== '${null}') {
            // Validar URL
            try {
                new URL(imageUrl);
            } catch (error) {
                return interaction.reply({ 
                    content: '❌ URL inválida! Por favor, insira uma URL válida.', 
                    ephemeral: true 
                });
            }
        }

        await db.updateGuildConfig(interaction.guildId, {
            'welcome.imageUrl': imageUrl || null
        });

        await interaction.reply({ 
            content: '✅ Imagem atualizada com sucesso!', 
            ephemeral: true 
        });

        await this.updateWelcomePanel(interaction);
    }

    static async handleWelcomeThumbnail(interaction) {
        const thumbnailUrl = interaction.fields.getTextInputValue('welcome_thumbnail_url');
        
        if (thumbnailUrl && thumbnailUrl !== '${null}') {
            // Validar URL
            try {
                new URL(thumbnailUrl);
            } catch (error) {
                return interaction.reply({ 
                    content: '❌ URL inválida! Por favor, insira uma URL válida.', 
                    ephemeral: true 
                });
            }
        }

        await db.updateGuildConfig(interaction.guildId, {
            'welcome.thumbnailUrl': thumbnailUrl || null
        });

        await interaction.reply({ 
            content: '✅ Thumbnail atualizada com sucesso!', 
            ephemeral: true 
        });

        await this.updateWelcomePanel(interaction);
    }

    static async handleWelcomeFooter(interaction) {
        const footerText = interaction.fields.getTextInputValue('welcome_footer_text');

        await db.updateGuildConfig(interaction.guildId, {
            'welcome.footer': footerText || null
        });

        await interaction.reply({ 
            content: '✅ Rodapé atualizado com sucesso!', 
            ephemeral: true 
        });

        await this.updateWelcomePanel(interaction);
    }

    static async handleWelcomeColor(interaction) {
        const colorHex = interaction.fields.getTextInputValue('welcome_color_hex');
        let color = colors.default;

        if (colorHex && colorHex !== '${null}') {
            // Tentar converter cor HEX ou nome
            if (colorHex.startsWith('#')) {
                // Validar HEX
                const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
                if (!hexRegex.test(colorHex)) {
                    return interaction.reply({ 
                        content: '❌ Cor HEX inválida! Use o formato #RRGGBB ou #RGB.', 
                        ephemeral: true 
                    });
                }
                color = colorHex;
            } else {
                // Tentar converter nome da cor (implementar mapeamento)
                const colorMap = {
                    'vermelho': '#FF0000',
                    'verde': '#00FF00',
                    'azul': '#0000FF',
                    'amarelo': '#FFFF00',
                    'roxo': '#800080',
                    'laranja': '#FFA500',
                    'preto': '#000000',
                    'branco': '#FFFFFF',
                    'cinza': '#808080',
                    'rosa': '#FFC0CB',
                    'marrom': '#A52A2A'
                };
                color = colorMap[colorHex.toLowerCase()] || colors.default;
            }
        }

        await db.updateGuildConfig(interaction.guildId, {
            'welcome.color': color
        });

        await interaction.reply({ 
            content: '✅ Cor atualizada com sucesso!', 
            ephemeral: true 
        });

        await this.updateWelcomePanel(interaction);
    }

    static async handleWelcomeButton(interaction) {
        const buttonName = interaction.fields.getTextInputValue('welcome_button_name');
        const buttonLink = interaction.fields.getTextInputValue('welcome_button_link');

        // Validar link
        try {
            new URL(buttonLink);
        } catch (error) {
            return interaction.reply({ 
                content: '❌ Link inválido! Por favor, insira uma URL válida.', 
                ephemeral: true 
            });
        }

        const guildConfig = await db.getGuildConfig(interaction.guildId);
        const welcome = guildConfig.welcome || {};
        const buttons = welcome.buttons || [];

        // Verificar se já existe um botão com o mesmo nome
        const existingButtonIndex = buttons.findIndex(btn => btn.name === buttonName);
        if (existingButtonIndex !== -1) {
            buttons[existingButtonIndex] = { name: buttonName, link: buttonLink };
        } else {
            buttons.push({ name: buttonName, link: buttonLink });
        }

        await db.updateGuildConfig(interaction.guildId, {
            'welcome.buttons': buttons
        });

        await interaction.reply({ 
            content: '✅ Botão adicionado/atualizado com sucesso!', 
            ephemeral: true 
        });

        await this.updateWelcomePanel(interaction);
    }

    static async updateWelcomePanel(interaction) {
        try {
            // Importar o comando de configurações para acessar o método
            const configCmd = require('../commands/Admin/configuracoes');
            await configCmd.showWelcomeSetupPanel(interaction);
        } catch (error) {
            console.error('Erro ao atualizar painel de configurações:', error);
        }
    }

    // Métodos para modals de saída
    static async handleLeaveTitleMessage(interaction) {
        const title = interaction.fields.getTextInputValue('leave_title');
        const message = interaction.fields.getTextInputValue('leave_message');

        const updateData = {};
        if (title) updateData['leave.title'] = title;
        if (message) updateData['leave.message'] = message;

        await db.updateGuildConfig(interaction.guildId, updateData);

        await interaction.reply({ 
            content: '✅ Título e mensagem de saída atualizados com sucesso!', 
            ephemeral: true 
        });

        await this.updateLeavePanel(interaction);
    }

    static async handleLeaveImage(interaction) {
        const imageUrl = interaction.fields.getTextInputValue('leave_image_url');
        
        if (imageUrl && imageUrl !== '${null}') {
            try {
                new URL(imageUrl);
            } catch (error) {
                return interaction.reply({ 
                    content: '❌ URL inválida! Por favor, insira uma URL válida.', 
                    ephemeral: true 
                });
            }
        }

        await db.updateGuildConfig(interaction.guildId, {
            'leave.imageUrl': imageUrl || null
        });

        await interaction.reply({ 
            content: '✅ Imagem de saída atualizada com sucesso!', 
            ephemeral: true 
        });

        await this.updateLeavePanel(interaction);
    }

    static async handleLeaveThumbnail(interaction) {
        const thumbnailUrl = interaction.fields.getTextInputValue('leave_thumbnail_url');
        
        if (thumbnailUrl && thumbnailUrl !== '${null}') {
            try {
                new URL(thumbnailUrl);
            } catch (error) {
                return interaction.reply({ 
                    content: '❌ URL inválida! Por favor, insira uma URL válida.', 
                    ephemeral: true 
                });
            }
        }

        await db.updateGuildConfig(interaction.guildId, {
            'leave.thumbnailUrl': thumbnailUrl || null
        });

        await interaction.reply({ 
            content: '✅ Thumbnail de saída atualizada com sucesso!', 
            ephemeral: true 
        });

        await this.updateLeavePanel(interaction);
    }

    static async handleLeaveFooter(interaction) {
        const footerText = interaction.fields.getTextInputValue('leave_footer_text');

        await db.updateGuildConfig(interaction.guildId, {
            'leave.footer': footerText || null
        });

        await interaction.reply({ 
            content: '✅ Rodapé de saída atualizado com sucesso!', 
            ephemeral: true 
        });

        await this.updateLeavePanel(interaction);
    }

    static async handleLeaveColor(interaction) {
        const colorHex = interaction.fields.getTextInputValue('leave_color_hex');
        let color = '#E74C3C'; // Cor padrão para saída

        if (colorHex && colorHex !== '${null}') {
            if (colorHex.startsWith('#')) {
                const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
                if (!hexRegex.test(colorHex)) {
                    return interaction.reply({ 
                        content: '❌ Cor HEX inválida! Use o formato #RRGGBB ou #RGB.', 
                        ephemeral: true 
                    });
                }
                color = colorHex;
            } else {
                const colorMap = {
                    'vermelho': '#FF0000',
                    'verde': '#00FF00',
                    'azul': '#0000FF',
                    'amarelo': '#FFFF00',
                    'roxo': '#800080',
                    'laranja': '#FFA500',
                    'preto': '#000000',
                    'branco': '#FFFFFF',
                    'cinza': '#808080',
                    'rosa': '#FFC0CB',
                    'marrom': '#A52A2A'
                };
                color = colorMap[colorHex.toLowerCase()] || '#E74C3C';
            }
        }

        await db.updateGuildConfig(interaction.guildId, {
            'leave.color': color
        });

        await interaction.reply({ 
            content: '✅ Cor de saída atualizada com sucesso!', 
            ephemeral: true 
        });

        await this.updateLeavePanel(interaction);
    }

    static async updateLeavePanel(interaction) {
        try {
            const configCmd = require('../commands/Admin/configuracoes');
            await configCmd.showLeaveSetupPanel(interaction);
        } catch (error) {
            console.error('Erro ao atualizar painel de saída:', error);
        }
    }
}

module.exports = ConfigModalHandler;
