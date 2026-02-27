const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder } = require('discord.js');
const { GuildConfig } = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configuracoes')
        .setDescription('Painel de configurações do servidor')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.guild) return interaction.reply({ content: 'Este comando só pode ser usado em servidores.', ephemeral: true });

        // Verificar se é dono do servidor ou tem permissão de Administrator (Staff)
        const isOwner = interaction.user.id === interaction.guild.ownerId;
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        
        if (!isOwner && !isAdmin) {
            return interaction.reply({ 
                content: '❌ Apenas **donos do servidor** e **membros com permissão de Administrator** podem usar este comando.', 
                ephemeral: true 
            });
        }

        try {
            // Verificar/Criar config
            let config = await GuildConfig.findOne({ guildId: interaction.guild.id });
            if (!config) {
                config = await GuildConfig.create({ guildId: interaction.guild.id });
            }

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Painel de Configurações')
                .setDescription('Bem-vindo ao painel de controle do bot.\nSelecione uma categoria abaixo para começar a configurar.')
                .setColor('#2B2D31')
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setFooter({ text: 'Sistema de Configuração Avançado', iconURL: interaction.client.user.displayAvatarURL() });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('config_category_select')
                .setPlaceholder('Selecione uma categoria')
                .addOptions([
                    {
                        label: 'Entrada e Saída de Membros',
                        description: 'Configure mensagens de boas-vindas e despedida.',
                        value: 'welcome_leave',
                        emoji: '👋'
                    },
                    {
                        label: 'Sistema de Parcerias',
                        description: 'Configure parcerias, canais e mensagens.',
                        value: 'partners_system',
                        emoji: '🤝'
                    }
                ]);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }
        } catch (error) {
            console.error(error);
            if (!interaction.replied) await interaction.reply({ content: 'Erro ao carregar configurações.', ephemeral: true });
        }
    },

    // --- HANDLERS ---

    async handleSelect(interaction) {
        if (interaction.customId === 'config_category_select') {
            const selected = interaction.values[0];
            if (selected === 'welcome_leave') {
                await this.showWelcomeLeavePanel(interaction);
            } else if (selected === 'partners_system') {
                await this.showPartnersPanel(interaction);
            }
        } else if (interaction.customId === 'config_channel_select') {
             await this.handleChannelSelect(interaction);
        } else if (interaction.customId === 'config_leave_channel_select') {
             await this.handleLeaveChannelSelect(interaction);
        } else if (interaction.customId === 'config_partners_channel_select') {
             await this.handlePartnersChannelSelect(interaction);
        } else if (interaction.customId === 'config_role_select') {
             await this.handleRoleSelect(interaction);
        } else if (interaction.customId.startsWith('config_partners_role_')) {
             await this.handlePartnersRoleSelect(interaction);
        }
    },

    async handleButton(interaction) {
        const customId = interaction.customId;

        // Navegação Principal
        if (customId === 'config_welcome_btn') {
            await this.showWelcomeConfig(interaction);
        } else if (customId === 'config_leave_btn') {
            await this.showLeaveConfig(interaction);
        } else if (customId === 'config_back_main') {
            await this.execute(interaction); // Volta para o menu principal
        } else if (customId === 'config_back_welcome_leave') {
            await this.showWelcomeLeavePanel(interaction);
        }
        
        // Ações de Configuração (Welcome)
        else if (customId === 'config_welcome_toggle_msg') await this.toggleWelcomeSetting(interaction, 'enabled');
        else if (customId === 'config_welcome_toggle_embed') await this.toggleWelcomeSetting(interaction, 'useEmbed');
        else if (customId === 'config_welcome_set_channel') await this.showChannelSelector(interaction);
        else if (customId === 'config_welcome_edit_msg') await this.showEditMessageModal(interaction);
        else if (customId === 'config_welcome_edit_footer') await this.showEditFooterModal(interaction);
        else if (customId === 'config_welcome_edit_image') await this.showEditImageModal(interaction);
        else if (customId === 'config_welcome_edit_thumbnail') await this.showEditThumbnailModal(interaction);
        else if (customId === 'config_welcome_add_button') await this.showAddButtonModal(interaction);
        else if (customId === 'config_welcome_toggle_mention') await this.toggleWelcomeSetting(interaction, 'notifyMember');
        else if (customId === 'config_welcome_edit_color') await this.showEditColorModal(interaction);
        else if (customId === 'config_welcome_set_role') await this.showRoleSelector(interaction);
        else if (customId === 'config_welcome_test') await this.testWelcomeMessage(interaction);

        // Ações de Configuração (Leave)
        else if (customId === 'config_leave_toggle_msg') await this.toggleLeaveSetting(interaction, 'enabled');
        else if (customId === 'config_leave_toggle_embed') await this.toggleLeaveSetting(interaction, 'useEmbed');
        else if (customId === 'config_leave_set_channel') await this.showLeaveChannelSelector(interaction);
        else if (customId === 'config_leave_edit_msg') await this.showLeaveEditMessageModal(interaction);
        else if (customId === 'config_leave_edit_footer') await this.showLeaveEditFooterModal(interaction);
        else if (customId === 'config_leave_edit_image') await this.showLeaveEditImageModal(interaction);
        else if (customId === 'config_leave_edit_thumbnail') await this.showLeaveEditThumbnailModal(interaction);
        else if (customId === 'config_leave_edit_color') await this.showLeaveEditColorModal(interaction);
        else if (customId === 'config_leave_test') await this.testLeaveMessage(interaction);

        // Ações de Configuração (Parcerias)
        else if (customId === 'config_partners_back') await this.showPartnersPanel(interaction);
        else if (customId === 'config_partners_set_channel') await this.showPartnersChannelSelector(interaction);
        else if (customId === 'config_partners_set_role_manager') await this.showPartnersRoleSelector(interaction, 'manager');
        else if (customId === 'config_partners_set_role_ping') await this.showPartnersRoleSelector(interaction, 'ping');
        else if (customId === 'config_partners_set_role_partner') await this.showPartnersRoleSelector(interaction, 'partner');
        else if (customId === 'config_partners_msg_public') await this.showPartnersPublicMsgConfig(interaction);
        else if (customId === 'config_partners_msg_dm') await this.showPartnersDmConfig(interaction);
        else if (customId === 'config_partners_rules') await this.showPartnersRulesConfig(interaction);
        else if (customId === 'config_partners_test') await this.testPartnership(interaction);
        
        // Ações de Configuração (Parcerias - Detalhes)
        // Public Message
        else if (customId === 'config_partners_edit_msg_public_title') await this.showPartnersEditPublicMsgModal(interaction);
        else if (customId === 'config_partners_edit_msg_public_footer') await this.showPartnersEditPublicFooterModal(interaction);
        else if (customId === 'config_partners_edit_msg_public_color') await this.showPartnersEditPublicColorModal(interaction);
        else if (customId === 'config_partners_edit_msg_public_image') await this.showPartnersEditPublicImageModal(interaction);
        else if (customId === 'config_partners_edit_msg_public_thumbnail') await this.showPartnersEditPublicThumbnailModal(interaction);

        // DM Message
        else if (customId === 'config_partners_toggle_dm') await this.togglePartnersDm(interaction);
        else if (customId === 'config_partners_edit_dm_title') await this.showPartnersEditDmMsgModal(interaction);
        else if (customId === 'config_partners_edit_dm_buttons') await this.showPartnersEditDmButtonModal(interaction);
        else if (customId === 'config_partners_edit_dm_footer') await this.showPartnersEditDmFooterModal(interaction);
        else if (customId === 'config_partners_edit_dm_color') await this.showPartnersEditDmColorModal(interaction);
        else if (customId === 'config_partners_edit_dm_image') await this.showPartnersEditDmImageModal(interaction);
        else if (customId === 'config_partners_edit_dm_thumbnail') await this.showPartnersEditDmThumbnailModal(interaction);

        // Rules
        else if (customId === 'config_partners_toggle_remove') await this.togglePartnersRule(interaction, 'removeOnLeave');
        else if (customId === 'config_partners_toggle_invite') await this.togglePartnersRule(interaction, 'requireInvite');
        else if (customId === 'config_partners_toggle_repeat') await this.togglePartnersRule(interaction, 'allowRepeatedGuild');
        else if (customId === 'config_partners_edit_limit') await this.showPartnersEditLimitModal(interaction);
        else if (customId === 'config_partners_test_dm') await this.testPartnersDm(interaction);
    },

    async handleModal(interaction) {
        // Welcome Modals
        if (interaction.customId === 'config_modal_welcome_msg') await this.saveWelcomeMessage(interaction);
        else if (interaction.customId === 'config_modal_welcome_footer') await this.saveWelcomeFooter(interaction);
        else if (interaction.customId === 'config_modal_welcome_image') await this.saveWelcomeImage(interaction);
        else if (interaction.customId === 'config_modal_welcome_thumbnail') await this.saveWelcomeThumbnail(interaction);
        else if (interaction.customId === 'config_modal_welcome_button') await this.saveWelcomeButton(interaction);
        else if (interaction.customId === 'config_modal_welcome_color') await this.saveWelcomeColor(interaction);
        
        // Leave Modals
        else if (interaction.customId === 'config_modal_leave_msg') await this.saveLeaveMessage(interaction);
        else if (interaction.customId === 'config_modal_leave_footer') await this.saveLeaveFooter(interaction);
        else if (interaction.customId === 'config_modal_leave_image') await this.saveLeaveImage(interaction);
        else if (interaction.customId === 'config_modal_leave_thumbnail') await this.saveLeaveThumbnail(interaction);
        else if (interaction.customId === 'config_modal_leave_color') await this.saveLeaveColor(interaction);

        // Partners Modals
        // Public
        else if (interaction.customId === 'config_modal_partners_public_msg') await this.savePartnersPublicMsg(interaction);
        else if (interaction.customId === 'config_modal_partners_public_footer') await this.savePartnersPublicFooter(interaction);
        else if (interaction.customId === 'config_modal_partners_public_color') await this.savePartnersPublicColor(interaction);
        else if (interaction.customId === 'config_modal_partners_public_image') await this.savePartnersPublicImage(interaction);
        else if (interaction.customId === 'config_modal_partners_public_thumbnail') await this.savePartnersPublicThumbnail(interaction);
        
        // DM
        else if (interaction.customId === 'config_modal_partners_dm_msg') await this.savePartnersDmMsg(interaction);
        else if (interaction.customId === 'config_modal_partners_dm_footer') await this.savePartnersDmFooter(interaction);
        else if (interaction.customId === 'config_modal_partners_dm_color') await this.savePartnersDmColor(interaction);
        else if (interaction.customId === 'config_modal_partners_dm_image') await this.savePartnersDmImage(interaction);
        else if (interaction.customId === 'config_modal_partners_dm_thumbnail') await this.savePartnersDmThumbnail(interaction);
        else if (interaction.customId === 'config_modal_partners_dm_button') await this.savePartnersDmButton(interaction);

        // Rules
        else if (interaction.customId === 'config_modal_partners_limit') await this.savePartnersLimit(interaction);
    },

    // --- PAINÉIS ---

    async showWelcomeLeavePanel(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const w = config.welcome || {};
        const l = config.leave || {};

        const embed = new EmbedBuilder()
            .setTitle('👋 Entrada e Saída de Membros')
            .setDescription('Configure como o bot deve reagir quando alguém entra ou sai do servidor.')
            .addFields(
                { 
                    name: 'Entrada (Welcome)', 
                    value: `Status: ${w.enabled ? '✅ Ativado' : '🔴 Desativado'}\nTipo: ${w.useEmbed ? '🖼️ Embed' : '📝 Texto'}\nCanal: ${w.channelId ? `<#${w.channelId}>` : '❌ Não definido'}`,
                    inline: true 
                },
                { 
                    name: 'Saída (Leave)', 
                    value: `Status: ${l.enabled ? '✅ Ativado' : '🔴 Desativado'}\nTipo: ${l.useEmbed ? '🖼️ Embed' : '📝 Texto'}\nCanal: ${l.channelId ? `<#${l.channelId}>` : '❌ Não definido'}`,
                    inline: true 
                }
            )
            .setColor('#3498DB');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_welcome_btn').setLabel('Configurar Entrada').setStyle(ButtonStyle.Success).setEmoji('📥'),
            new ButtonBuilder().setCustomId('config_leave_btn').setLabel('Configurar Saída').setStyle(ButtonStyle.Danger).setEmoji('📤'),
            new ButtonBuilder().setCustomId('config_back_main').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('🔙')
        );

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed], components: [row] });
        } else {
            await interaction.update({ embeds: [embed], components: [row] });
        }
    },

    async showWelcomeConfig(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const w = config.welcome || {};

        const helpEmbed = new EmbedBuilder()
            .setTitle('📥 Configuração de Entrada (Welcome)')
            .setDescription('Aqui você personaliza a mensagem de boas-vindas.')
            .addFields(
                { 
                    name: 'Variáveis Disponíveis', 
                    value: '`${user}` - Menciona o membro\n`${user.name}` - Nome do membro\n`${user.globalName}` - Nome global\n`${user.id}` - ID do membro\n`${guild.name}` - Nome do servidor\n`${guild.memberCount}` - Total de membros\n`${user.avatar}` - Avatar URL\n`${null}` - Remove imagem/thumbnail/mensagem' 
                },
                {
                    name: 'Botões',
                    value: 'Use `${null}` para remover todos os botões ou `${Nome}` para remover um específico.'
                }
            )
            .setColor(w.color || '#2ECC71');
            
        if (w.thumbnailUrl && w.thumbnailUrl.startsWith('http')) helpEmbed.setThumbnail(w.thumbnailUrl);
        if (w.imageUrl && w.imageUrl.startsWith('http')) helpEmbed.setImage(w.imageUrl);
        if (w.footer) helpEmbed.setFooter({ text: w.footer });

        // Botões
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_welcome_toggle_msg').setLabel(w.enabled ? 'Desativar Mensagem' : 'Ativar Mensagem').setStyle(w.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('config_welcome_toggle_embed').setLabel(w.useEmbed ? 'Desativar Embed' : 'Ativar Embed').setStyle(w.useEmbed ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('config_welcome_set_channel').setLabel('Selecionar Canal').setStyle(ButtonStyle.Primary).setEmoji('📢')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_welcome_edit_msg').setLabel('Alterar Título/Msg').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
            new ButtonBuilder().setCustomId('config_welcome_edit_footer').setLabel('Alterar Footer').setStyle(ButtonStyle.Secondary).setEmoji('🦶'),
            new ButtonBuilder().setCustomId('config_welcome_edit_image').setLabel('Alterar Imagem').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
            new ButtonBuilder().setCustomId('config_welcome_edit_thumbnail').setLabel('Alterar Thumbnail').setStyle(ButtonStyle.Secondary).setEmoji('🖼️')
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_welcome_add_button').setLabel('Adicionar Botão').setStyle(ButtonStyle.Success).setEmoji('🔗'),
            new ButtonBuilder().setCustomId('config_welcome_toggle_mention').setLabel(w.notifyMember ? 'Notificar Membro: ON' : 'Notificar Membro: OFF').setStyle(w.notifyMember ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('config_welcome_edit_color').setLabel('Cor da Embed').setStyle(ButtonStyle.Secondary).setEmoji('🎨')
        );

        const row4 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_welcome_set_role').setLabel('Notificar Cargo').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
            new ButtonBuilder().setCustomId('config_welcome_test').setLabel('Testar Mensagem').setStyle(ButtonStyle.Primary).setEmoji('🧪'),
            new ButtonBuilder().setCustomId('config_back_welcome_leave').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('🔙')
        );

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [helpEmbed], components: [row1, row2, row3, row4] });
        } else {
            await interaction.update({ embeds: [helpEmbed], components: [row1, row2, row3, row4] });
        }
    },

    async showLeaveConfig(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const l = config.leave || {};

        const helpEmbed = new EmbedBuilder()
            .setTitle('📤 Configuração de Saída (Leave)')
            .setDescription('Aqui você personaliza a mensagem de despedida.')
            .addFields(
                { 
                    name: 'Variáveis Disponíveis', 
                    value: '`${user}` - Menciona o membro\n`${user.name}` - Nome do membro\n`${user.globalName}` - Nome global\n`${user.id}` - ID do membro\n`${guild.name}` - Nome do servidor\n`${guild.memberCount}` - Total de membros\n`${user.avatar}` - Avatar URL\n`${null}` - Remove imagem/thumbnail/mensagem' 
                }
            )
            .setColor(l.color || '#E74C3C');
            
        if (l.thumbnailUrl && l.thumbnailUrl.startsWith('http')) helpEmbed.setThumbnail(l.thumbnailUrl);
        if (l.imageUrl && l.imageUrl.startsWith('http')) helpEmbed.setImage(l.imageUrl);
        if (l.footer) helpEmbed.setFooter({ text: l.footer });

        // Botões
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_leave_toggle_msg').setLabel(l.enabled ? 'Desativar Mensagem' : 'Ativar Mensagem').setStyle(l.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('config_leave_toggle_embed').setLabel(l.useEmbed ? 'Desativar Embed' : 'Ativar Embed').setStyle(l.useEmbed ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('config_leave_set_channel').setLabel('Selecionar Canal').setStyle(ButtonStyle.Primary).setEmoji('📢')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_leave_edit_msg').setLabel('Alterar Título/Msg').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
            new ButtonBuilder().setCustomId('config_leave_edit_footer').setLabel('Alterar Rodapé').setStyle(ButtonStyle.Secondary).setEmoji('🦶'),
            new ButtonBuilder().setCustomId('config_leave_edit_image').setLabel('Alterar Imagem').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
            new ButtonBuilder().setCustomId('config_leave_edit_thumbnail').setLabel('Alterar Thumbnail').setStyle(ButtonStyle.Secondary).setEmoji('🖼️')
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_leave_edit_color').setLabel('Mudar Cor do Embed').setStyle(ButtonStyle.Secondary).setEmoji('🎨'),
            new ButtonBuilder().setCustomId('config_leave_test').setLabel('Testar Mensagem').setStyle(ButtonStyle.Primary).setEmoji('🧪'),
            new ButtonBuilder().setCustomId('config_back_welcome_leave').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('🔙')
        );

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [helpEmbed], components: [row1, row2, row3] });
        } else {
            await interaction.update({ embeds: [helpEmbed], components: [row1, row2, row3] });
        }
    },

    async showPartnersPanel(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const p = config.partners || {};

        const statusEmbed = new EmbedBuilder()
            .setTitle('🤝 Sistema de Parcerias')
            .setDescription('Aqui você gerencia as parcerias do servidor. Configure canais, cargos e mensagens para automatizar o processo.')
            .addFields(
                { name: '📺 Canal de Parcerias', value: p.channelId ? `<#${p.channelId}>` : '❌ Não configurado', inline: true },
                { name: '👮 Cargo Responsável', value: p.managerRoleId ? `<@&${p.managerRoleId}>` : '❌ Não configurado', inline: true },
                { name: '🔔 Cargo de Ping', value: p.pingRoleId ? `<@&${p.pingRoleId}>` : '❌ Não configurado', inline: true },
                { name: '🤝 Cargo de Parceiro', value: p.partnerRoleId ? `<@&${p.partnerRoleId}>` : '❌ Não configurado', inline: true },
                { name: '📩 DM ao Representante', value: p.dmEnabled ? '✅ Ativado' : '🔴 Desativado', inline: true },
                { name: '❓ Como funciona?', value: 'Quando alguém com o **Cargo Responsável** envia uma mensagem no **Canal de Parcerias** contendo um link de convite e mencionando um usuário (o representante), o bot formata automaticamente a mensagem e notifica as partes envolvidas.' }
            )
            .setColor('#9B59B6')
            .setFooter({ text: 'Configure cada etapa usando os botões abaixo.' });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_partners_set_channel').setLabel('Definir Canal').setStyle(ButtonStyle.Primary).setEmoji('📺'),
            new ButtonBuilder().setCustomId('config_partners_set_role_manager').setLabel('Cargo Responsável').setStyle(ButtonStyle.Secondary).setEmoji('👮'),
            new ButtonBuilder().setCustomId('config_partners_set_role_ping').setLabel('Cargo de Ping').setStyle(ButtonStyle.Secondary).setEmoji('🔔'),
            new ButtonBuilder().setCustomId('config_partners_set_role_partner').setLabel('Cargo de Parceiro').setStyle(ButtonStyle.Secondary).setEmoji('🤝')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_partners_msg_public').setLabel('Configurar Mensagem Pública').setStyle(ButtonStyle.Primary).setEmoji('📢'),
            new ButtonBuilder().setCustomId('config_partners_msg_dm').setLabel('Configurar DM Rep.').setStyle(ButtonStyle.Primary).setEmoji('📩'),
            new ButtonBuilder().setCustomId('config_partners_rules').setLabel('Configurar Regras').setStyle(ButtonStyle.Danger).setEmoji('📜')
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_partners_test').setLabel('Testar Parceria').setStyle(ButtonStyle.Success).setEmoji('🧪'),
            new ButtonBuilder().setCustomId('config_back_main').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('🔙')
        );

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [statusEmbed], components: [row1, row2, row3] });
        } else {
            await interaction.update({ embeds: [statusEmbed], components: [row1, row2, row3] });
        }
    },

    async showPartnersPublicMsgConfig(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const p = config.partners?.publicMessage || {};

        const embed = new EmbedBuilder()
            .setTitle('📢 Configuração de Mensagem Pública')
            .setDescription('Esta é a mensagem que será enviada no canal de parcerias quando uma nova parceria for fechada.')
            .addFields(
                { name: '📝 Variáveis Disponíveis', value: 'Você pode usar estas variáveis no título e na descrição:\n\n`${rep}` - Menciona o representante\n`${promoter}` - Menciona quem fez a parceria\n`${guild}` - Nome do servidor parceiro\n`${invite}` - Link do convite\n`${count}` - Contador de parcerias' }
            )
            .setColor(p.color || '#3498DB');

        if (p.thumbnail) embed.setThumbnail(p.thumbnail);
        if (p.image) embed.setImage(p.image);
        if (p.footer) embed.setFooter({ text: p.footer });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_partners_edit_msg_public_title').setLabel('Editar Título/Msg').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
            new ButtonBuilder().setCustomId('config_partners_edit_msg_public_footer').setLabel('Editar Rodapé').setStyle(ButtonStyle.Secondary).setEmoji('🦶'),
            new ButtonBuilder().setCustomId('config_partners_edit_msg_public_color').setLabel('Editar Cor').setStyle(ButtonStyle.Secondary).setEmoji('🎨')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_partners_edit_msg_public_image').setLabel('Editar Imagem').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
            new ButtonBuilder().setCustomId('config_partners_edit_msg_public_thumbnail').setLabel('Editar Thumbnail').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
            new ButtonBuilder().setCustomId('config_partners_back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('🔙')
        );

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed], components: [row1, row2] });
        } else {
            await interaction.update({ embeds: [embed], components: [row1, row2] });
        }
    },

    async showPartnersDmConfig(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const p = config.partners?.dmMessage || {};
        const dmEnabled = config.partners?.dmEnabled ?? true;

        const embed = new EmbedBuilder()
            .setTitle('📩 Configuração de DM do Representante')
            .setDescription(`Status: ${dmEnabled ? '✅ Ativado' : '🔴 Desativado'}\n\nEsta mensagem será enviada no privado do representante da parceria. É útil para dar boas-vindas ou instruções adicionais.`)
            .addFields(
                { name: '💡 Dica', value: 'Use o botão "Botões" para adicionar links úteis na DM (como site do seu servidor ou suporte).' }
            )
            .setColor(p.color || '#3498DB');

        if (p.thumbnail) embed.setThumbnail(p.thumbnail);
        if (p.image) embed.setImage(p.image);
        if (p.footer) embed.setFooter({ text: p.footer });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_partners_toggle_dm').setLabel(dmEnabled ? 'Desativar DM' : 'Ativar DM').setStyle(dmEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('config_partners_edit_dm_title').setLabel('Editar Título/Msg').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
            new ButtonBuilder().setCustomId('config_partners_edit_dm_buttons').setLabel('Botões').setStyle(ButtonStyle.Primary).setEmoji('🔗')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_partners_edit_dm_footer').setLabel('Editar Rodapé').setStyle(ButtonStyle.Secondary).setEmoji('🦶'),
            new ButtonBuilder().setCustomId('config_partners_edit_dm_color').setLabel('Editar Cor').setStyle(ButtonStyle.Secondary).setEmoji('🎨'),
            new ButtonBuilder().setCustomId('config_partners_edit_dm_image').setLabel('Editar Imagem').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
            new ButtonBuilder().setCustomId('config_partners_edit_dm_thumbnail').setLabel('Editar Thumbnail').setStyle(ButtonStyle.Secondary).setEmoji('🖼️')
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_partners_test_dm').setLabel('Testar DM').setStyle(ButtonStyle.Success).setEmoji('🧪'),
            new ButtonBuilder().setCustomId('config_partners_back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('🔙')
        );

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });
        } else {
            await interaction.update({ embeds: [embed], components: [row1, row2, row3] });
        }
    },

    async showPartnersRulesConfig(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const r = config.partners?.rules || {};

        const embed = new EmbedBuilder()
            .setTitle('📜 Regras de Parceria')
            .setDescription('Defina as regras de segurança e limites para o sistema de parcerias.')
            .addFields(
                { name: '🚪 Remover se sair', value: `${r.removeOnLeave ? '✅ Sim' : '❌ Não'}\nremove a parceria se o representante sair do servidor.`, inline: true },
                { name: '🔗 Exigir Convite', value: `${r.requireInvite ? '✅ Sim' : '❌ Não'}\nexige um link de convite válido na mensagem.`, inline: true },
                { name: '🔄 Repetir Servidor', value: `${r.allowRepeatedGuild ? '✅ Permitido' : '❌ Bloqueado'}\npermite parcerias repetidas do mesmo servidor.`, inline: true },
                { name: '🔢 Limite Diário', value: `${r.dailyLimit > 0 ? r.dailyLimit : '∞ Infinito'}\nlimite de parcerias que um membro pode fazer por dia.`, inline: true }
            )
            .setColor('#E67E22');

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_partners_toggle_remove').setLabel('Remover se Sair').setStyle(r.removeOnLeave ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('config_partners_toggle_invite').setLabel('Exigir Convite').setStyle(r.requireInvite ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('config_partners_toggle_repeat').setLabel('Repetir Servidor').setStyle(r.allowRepeatedGuild ? ButtonStyle.Success : ButtonStyle.Danger)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('config_partners_edit_limit').setLabel('Definir Limite Diário').setStyle(ButtonStyle.Primary).setEmoji('🔢'),
            new ButtonBuilder().setCustomId('config_partners_back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('🔙')
        );

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed], components: [row1, row2] });
        } else {
            await interaction.update({ embeds: [embed], components: [row1, row2] });
        }
    },

    // --- ACTIONS & MODALS ---

    async toggleWelcomeSetting(interaction, setting) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        if (!config.welcome) config.welcome = {};
        config.welcome[setting] = !config.welcome[setting];
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { [`welcome.${setting}`]: config.welcome[setting] } });
        await this.showWelcomeConfig(interaction);
    },
    
    async toggleLeaveSetting(interaction, setting) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        if (!config.leave) config.leave = {};
        config.leave[setting] = !config.leave[setting];
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { [`leave.${setting}`]: config.leave[setting] } });
        await this.showLeaveConfig(interaction);
    },

    async showChannelSelector(interaction) {
        const select = new ChannelSelectMenuBuilder()
            .setCustomId('config_channel_select')
            .setPlaceholder('Selecione o canal de boas-vindas')
            .setChannelTypes(ChannelType.GuildText);

        const row = new ActionRowBuilder().addComponents(select);
        
        await interaction.reply({ content: 'Selecione o canal abaixo:', components: [row], ephemeral: true });
    },

    async showLeaveChannelSelector(interaction) {
        const select = new ChannelSelectMenuBuilder()
            .setCustomId('config_leave_channel_select')
            .setPlaceholder('Selecione o canal de saída')
            .setChannelTypes(ChannelType.GuildText);

        const row = new ActionRowBuilder().addComponents(select);
        
        await interaction.reply({ content: 'Selecione o canal abaixo:', components: [row], ephemeral: true });
    },

    async handleChannelSelect(interaction) {
        const channelId = interaction.values[0];
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'welcome.channelId': channelId } });
        await interaction.update({ content: `✅ Canal de boas-vindas definido para <#${channelId}>!`, components: [] });
    },

    async handleLeaveChannelSelect(interaction) {
        const channelId = interaction.values[0];
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'leave.channelId': channelId } });
        await interaction.update({ content: `✅ Canal de saída definido para <#${channelId}>!`, components: [] });
    },
    
    async showRoleSelector(interaction) {
        const select = new RoleSelectMenuBuilder()
            .setCustomId('config_role_select')
            .setPlaceholder('Selecione o cargo para notificar');

        const row = new ActionRowBuilder().addComponents(select);
        await interaction.reply({ content: 'Selecione o cargo abaixo:', components: [row], ephemeral: true });
    },

    async handleRoleSelect(interaction) {
        const roleId = interaction.values[0];
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'welcome.notifyRoleId': roleId } });
        await interaction.update({ content: `✅ Cargo de notificação definido para <@&${roleId}>!`, components: [] });
    },

    async showEditMessageModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        
        const modal = new ModalBuilder().setCustomId('config_modal_welcome_msg').setTitle('Editar Mensagem de Entrada');
        
        const titleInput = new TextInputBuilder()
            .setCustomId('welcome_title_input')
            .setLabel("Título da Embed")
            .setStyle(TextInputStyle.Short)
            .setValue(config.welcome?.title || 'Bem-vindo!')
            .setRequired(false);

        const msgInput = new TextInputBuilder()
            .setCustomId('welcome_msg_input')
            .setLabel("Mensagem (Suporta variáveis)")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(config.welcome?.message || 'Olá ${user}!')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(msgInput));
        await interaction.showModal(modal);
    },

    async showLeaveEditMessageModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        
        const modal = new ModalBuilder().setCustomId('config_modal_leave_msg').setTitle('Editar Mensagem de Saída');
        
        const titleInput = new TextInputBuilder()
            .setCustomId('leave_title_input')
            .setLabel("Título da Embed")
            .setStyle(TextInputStyle.Short)
            .setValue(config.leave?.title || 'Membro saiu do servidor')
            .setRequired(false);

        const msgInput = new TextInputBuilder()
            .setCustomId('leave_msg_input')
            .setLabel("Mensagem (Suporta variáveis)")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(config.leave?.message || '${user.name} saiu do ${guild.name}. Agora somos ${guild.memberCount} membros.')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(msgInput));
        await interaction.showModal(modal);
    },

    async saveWelcomeMessage(interaction) {
        const title = interaction.fields.getTextInputValue('welcome_title_input');
        const message = interaction.fields.getTextInputValue('welcome_msg_input');
        
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { 
            $set: { 'welcome.title': title, 'welcome.message': message } 
        });
        
        await interaction.deferUpdate();
        await this.showWelcomeConfig(interaction);
    },

    async saveLeaveMessage(interaction) {
        const title = interaction.fields.getTextInputValue('leave_title_input');
        const message = interaction.fields.getTextInputValue('leave_msg_input');
        
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { 
            $set: { 'leave.title': title, 'leave.message': message } 
        });
        
        await interaction.deferUpdate();
        await this.showLeaveConfig(interaction);
    },

    async showEditFooterModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const modal = new ModalBuilder().setCustomId('config_modal_welcome_footer').setTitle('Editar Rodapé');
        const input = new TextInputBuilder()
            .setCustomId('footer_input')
            .setLabel("Texto do Rodapé")
            .setStyle(TextInputStyle.Short)
            .setValue(config.welcome?.footer || '')
            .setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async showLeaveEditFooterModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const modal = new ModalBuilder().setCustomId('config_modal_leave_footer').setTitle('Editar Rodapé');
        const input = new TextInputBuilder()
            .setCustomId('footer_input')
            .setLabel("Texto do Rodapé")
            .setStyle(TextInputStyle.Short)
            .setValue(config.leave?.footer || '')
            .setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async saveWelcomeFooter(interaction) {
        let footer = interaction.fields.getTextInputValue('footer_input');
        if (footer === '${null}' || footer.trim() === '') footer = null;
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'welcome.footer': footer } });
        await interaction.deferUpdate();
        await this.showWelcomeConfig(interaction);
    },

    async saveLeaveFooter(interaction) {
        let footer = interaction.fields.getTextInputValue('footer_input');
        if (footer === '${null}' || footer.trim() === '') footer = null;
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'leave.footer': footer } });
        await interaction.deferUpdate();
        await this.showLeaveConfig(interaction);
    },

    async showEditImageModal(interaction) {
        const modal = new ModalBuilder().setCustomId('config_modal_welcome_image').setTitle('Alterar Imagem Grande');
        const input = new TextInputBuilder()
            .setCustomId('image_input')
            .setLabel("URL da Imagem (ou ${null} para remover)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async showLeaveEditImageModal(interaction) {
        const modal = new ModalBuilder().setCustomId('config_modal_leave_image').setTitle('Alterar Imagem Grande');
        const input = new TextInputBuilder()
            .setCustomId('image_input')
            .setLabel("URL da Imagem (ou ${null} para remover)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async saveWelcomeImage(interaction) {
        let url = interaction.fields.getTextInputValue('image_input');
        if (url === '${null}') url = null;
        // Basic URL validation
        if (url && !url.startsWith('http')) {
            return interaction.reply({ content: 'URL inválida.', ephemeral: true });
        }
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'welcome.imageUrl': url } });
        await interaction.deferUpdate();
        await this.showWelcomeConfig(interaction);
    },

    async saveLeaveImage(interaction) {
        let url = interaction.fields.getTextInputValue('image_input');
        if (url === '${null}') url = null;
        if (url && !url.startsWith('http')) {
            return interaction.reply({ content: 'URL inválida.', ephemeral: true });
        }
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'leave.imageUrl': url } });
        await interaction.deferUpdate();
        await this.showLeaveConfig(interaction);
    },

    async showEditThumbnailModal(interaction) {
        const modal = new ModalBuilder().setCustomId('config_modal_welcome_thumbnail').setTitle('Alterar Thumbnail');
        const input = new TextInputBuilder()
            .setCustomId('thumbnail_input')
            .setLabel("URL da Thumbnail (ou ${null} para remover)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async showLeaveEditThumbnailModal(interaction) {
        const modal = new ModalBuilder().setCustomId('config_modal_leave_thumbnail').setTitle('Alterar Thumbnail');
        const input = new TextInputBuilder()
            .setCustomId('thumbnail_input')
            .setLabel("URL da Thumbnail (ou ${null} para remover)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async saveWelcomeThumbnail(interaction) {
        let url = interaction.fields.getTextInputValue('thumbnail_input');
        if (url === '${null}') url = null;
        if (url && !url.startsWith('http') && !url.includes('${user.avatar}')) {
             return interaction.reply({ content: 'URL inválida.', ephemeral: true });
        }
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'welcome.thumbnailUrl': url } });
        await interaction.deferUpdate();
        await this.showWelcomeConfig(interaction);
    },

    async saveLeaveThumbnail(interaction) {
        let url = interaction.fields.getTextInputValue('thumbnail_input');
        if (url === '${null}') url = null;
        if (url && !url.startsWith('http') && !url.includes('${user.avatar}')) {
             return interaction.reply({ content: 'URL inválida.', ephemeral: true });
        }
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'leave.thumbnailUrl': url } });
        await interaction.deferUpdate();
        await this.showLeaveConfig(interaction);
    },

    async showEditColorModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const modal = new ModalBuilder().setCustomId('config_modal_welcome_color').setTitle('Alterar Cor da Embed');
        const input = new TextInputBuilder()
            .setCustomId('color_input')
            .setLabel("Cor HEX (ex: #FF0000)")
            .setStyle(TextInputStyle.Short)
            .setValue(config.welcome?.color || '#2ECC71')
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async showLeaveEditColorModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const modal = new ModalBuilder().setCustomId('config_modal_leave_color').setTitle('Alterar Cor da Embed');
        const input = new TextInputBuilder()
            .setCustomId('color_input')
            .setLabel("Cor HEX (ex: #FF0000)")
            .setStyle(TextInputStyle.Short)
            .setValue(config.leave?.color || '#E74C3C')
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async saveWelcomeColor(interaction) {
        const color = interaction.fields.getTextInputValue('color_input');
        if (!/^#[0-9A-F]{6}$/i.test(color)) {
            return interaction.reply({ content: 'Cor inválida. Use formato HEX (ex: #FF0000).', ephemeral: true });
        }
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'welcome.color': color } });
        await interaction.deferUpdate();
        await this.showWelcomeConfig(interaction);
    },

    async saveLeaveColor(interaction) {
        const color = interaction.fields.getTextInputValue('color_input');
        if (!/^#[0-9A-F]{6}$/i.test(color)) {
            return interaction.reply({ content: 'Cor inválida. Use formato HEX (ex: #FF0000).', ephemeral: true });
        }
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'leave.color': color } });
        await interaction.deferUpdate();
        await this.showLeaveConfig(interaction);
    },

    async showAddButtonModal(interaction) {
        const modal = new ModalBuilder().setCustomId('config_modal_welcome_button').setTitle('Adicionar/Remover Botão');
        const nameInput = new TextInputBuilder().setCustomId('btn_name').setLabel("Nome do Botão").setStyle(TextInputStyle.Short).setRequired(true);
        const urlInput = new TextInputBuilder().setCustomId('btn_url').setLabel("URL (ou ${null} para remover)").setStyle(TextInputStyle.Short).setRequired(true);
        
        modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(urlInput));
        await interaction.showModal(modal);
    },

    async saveWelcomeButton(interaction) {
        const name = interaction.fields.getTextInputValue('btn_name');
        const url = interaction.fields.getTextInputValue('btn_url');
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        let buttons = config.welcome?.buttons || [];

        if (url === '${null}') {
            // Remove button by name
            buttons = buttons.filter(b => b.name !== name);
        } else if (name === '${null}') {
            // Remove all buttons
            buttons = [];
        } else {
            // Add or Update
            if (!url.startsWith('http')) return interaction.reply({ content: 'URL inválida.', ephemeral: true });
            
            const existingIndex = buttons.findIndex(b => b.name === name);
            if (existingIndex >= 0) {
                buttons[existingIndex].url = url;
            } else {
                if (buttons.length >= 5) return interaction.reply({ content: 'Máximo de 5 botões atingido.', ephemeral: true });
                buttons.push({ name, url });
            }
        }

        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'welcome.buttons': buttons } });
        await interaction.deferUpdate();
        await this.showWelcomeConfig(interaction);
    },

    // --- PARTNERS HANDLERS ---

    async showPartnersChannelSelector(interaction) {
        const select = new ChannelSelectMenuBuilder()
            .setCustomId('config_partners_channel_select')
            .setPlaceholder('Selecione o canal de parcerias')
            .setChannelTypes(ChannelType.GuildText);
        
        await interaction.reply({ content: 'Selecione o canal abaixo:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    },

    async handlePartnersChannelSelect(interaction) {
        const channelId = interaction.values[0];
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.channelId': channelId } });
        await interaction.update({ content: `✅ Canal de parcerias definido para <#${channelId}>!`, components: [] });
    },

    async showPartnersRoleSelector(interaction, roleType) {
        const select = new RoleSelectMenuBuilder()
            .setCustomId(`config_partners_role_${roleType}`)
            .setPlaceholder(`Selecione o cargo ${roleType}`);
        
        await interaction.reply({ content: 'Selecione o cargo abaixo:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    },

    async handlePartnersRoleSelect(interaction) {
        const roleType = interaction.customId.replace('config_partners_role_', '');
        const roleId = interaction.values[0];
        
        let updateField = '';
        if (roleType === 'manager') updateField = 'partners.managerRoleId';
        else if (roleType === 'ping') updateField = 'partners.pingRoleId';
        else if (roleType === 'partner') updateField = 'partners.partnerRoleId';

        if (updateField) {
            await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { [updateField]: roleId } });
            await interaction.update({ content: `✅ Cargo definido com sucesso!`, components: [] });
        }
    },
    
    // --- PARTNERS IMPLEMENTATION ---

    // PUBLIC MESSAGE MODALS
    async showPartnersEditPublicMsgModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const p = config.partners?.publicMessage || {};

        const modal = new ModalBuilder().setCustomId('config_modal_partners_public_msg').setTitle('Editar Mensagem Pública');
        
        const titleInput = new TextInputBuilder().setCustomId('msg_title').setLabel("Título").setStyle(TextInputStyle.Short).setValue(p.title || '🤝 Nova parceria registrada!').setRequired(false);
        const descInput = new TextInputBuilder().setCustomId('msg_desc').setLabel("Descrição (Variáveis: ${rep}, ${guild}...)").setStyle(TextInputStyle.Paragraph).setValue(p.description || '').setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(descInput));
        await interaction.showModal(modal);
    },
    
    async savePartnersPublicMsg(interaction) {
        const title = interaction.fields.getTextInputValue('msg_title');
        const desc = interaction.fields.getTextInputValue('msg_desc');
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.publicMessage.title': title, 'partners.publicMessage.description': desc } });
        await interaction.deferUpdate();
        await this.showPartnersPublicMsgConfig(interaction);
    },

    async showPartnersEditPublicFooterModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const modal = new ModalBuilder().setCustomId('config_modal_partners_public_footer').setTitle('Editar Rodapé Público');
        const input = new TextInputBuilder().setCustomId('msg_footer').setLabel("Rodapé").setStyle(TextInputStyle.Short).setValue(config.partners?.publicMessage?.footer || '').setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async savePartnersPublicFooter(interaction) {
        const footer = interaction.fields.getTextInputValue('msg_footer');
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.publicMessage.footer': footer } });
        await interaction.deferUpdate();
        await this.showPartnersPublicMsgConfig(interaction);
    },

    async showPartnersEditPublicColorModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const modal = new ModalBuilder().setCustomId('config_modal_partners_public_color').setTitle('Editar Cor Pública');
        const input = new TextInputBuilder().setCustomId('msg_color').setLabel("Cor HEX").setStyle(TextInputStyle.Short).setValue(config.partners?.publicMessage?.color || '').setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async savePartnersPublicColor(interaction) {
        const color = interaction.fields.getTextInputValue('msg_color');
        if (color && !/^#[0-9A-F]{6}$/i.test(color)) return interaction.reply({ content: 'Cor inválida.', ephemeral: true });
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.publicMessage.color': color } });
        await interaction.deferUpdate();
        await this.showPartnersPublicMsgConfig(interaction);
    },

    async showPartnersEditPublicImageModal(interaction) {
        const modal = new ModalBuilder().setCustomId('config_modal_partners_public_image').setTitle('Editar Imagem Pública');
        const input = new TextInputBuilder().setCustomId('msg_image').setLabel("URL da Imagem").setStyle(TextInputStyle.Short).setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async savePartnersPublicImage(interaction) {
        let url = interaction.fields.getTextInputValue('msg_image');
        if (url === '${null}') url = null;
        if (url && !url.startsWith('http')) return interaction.reply({ content: 'URL inválida.', ephemeral: true });
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.publicMessage.image': url } });
        await interaction.deferUpdate();
        await this.showPartnersPublicMsgConfig(interaction);
    },

    async showPartnersEditPublicThumbnailModal(interaction) {
        const modal = new ModalBuilder().setCustomId('config_modal_partners_public_thumbnail').setTitle('Editar Thumbnail Pública');
        const input = new TextInputBuilder().setCustomId('msg_thumbnail').setLabel("URL da Thumbnail").setStyle(TextInputStyle.Short).setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async savePartnersPublicThumbnail(interaction) {
        let url = interaction.fields.getTextInputValue('msg_thumbnail');
        if (url === '${null}') url = null;
        if (url && !url.startsWith('http')) return interaction.reply({ content: 'URL inválida.', ephemeral: true });
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.publicMessage.thumbnail': url } });
        await interaction.deferUpdate();
        await this.showPartnersPublicMsgConfig(interaction);
    },

    // DM MESSAGE MODALS
    async togglePartnersDm(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const newState = !(config.partners?.dmEnabled ?? true);
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.dmEnabled': newState } });
        await this.showPartnersDmConfig(interaction);
    },

    async showPartnersEditDmMsgModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const p = config.partners?.dmMessage || {};

        const modal = new ModalBuilder().setCustomId('config_modal_partners_dm_msg').setTitle('Editar Mensagem DM');
        
        const titleInput = new TextInputBuilder().setCustomId('msg_title').setLabel("Título").setStyle(TextInputStyle.Short).setValue(p.title || '🤝 Parceria confirmada!').setRequired(false);
        const descInput = new TextInputBuilder().setCustomId('msg_desc').setLabel("Descrição").setStyle(TextInputStyle.Paragraph).setValue(p.description || '').setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(descInput));
        await interaction.showModal(modal);
    },

    async savePartnersDmMsg(interaction) {
        const title = interaction.fields.getTextInputValue('msg_title');
        const desc = interaction.fields.getTextInputValue('msg_desc');
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.dmMessage.title': title, 'partners.dmMessage.description': desc } });
        await interaction.deferUpdate();
        await this.showPartnersDmConfig(interaction);
    },

    async showPartnersEditDmFooterModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const modal = new ModalBuilder().setCustomId('config_modal_partners_dm_footer').setTitle('Editar Rodapé DM');
        const input = new TextInputBuilder().setCustomId('msg_footer').setLabel("Rodapé").setStyle(TextInputStyle.Short).setValue(config.partners?.dmMessage?.footer || '').setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async savePartnersDmFooter(interaction) {
        const footer = interaction.fields.getTextInputValue('msg_footer');
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.dmMessage.footer': footer } });
        await interaction.deferUpdate();
        await this.showPartnersDmConfig(interaction);
    },

    async showPartnersEditDmColorModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const modal = new ModalBuilder().setCustomId('config_modal_partners_dm_color').setTitle('Editar Cor DM');
        const input = new TextInputBuilder().setCustomId('msg_color').setLabel("Cor HEX").setStyle(TextInputStyle.Short).setValue(config.partners?.dmMessage?.color || '').setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async savePartnersDmColor(interaction) {
        const color = interaction.fields.getTextInputValue('msg_color');
        if (color && !/^#[0-9A-F]{6}$/i.test(color)) return interaction.reply({ content: 'Cor inválida.', ephemeral: true });
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.dmMessage.color': color } });
        await interaction.deferUpdate();
        await this.showPartnersDmConfig(interaction);
    },

    async showPartnersEditDmImageModal(interaction) {
        const modal = new ModalBuilder().setCustomId('config_modal_partners_dm_image').setTitle('Editar Imagem DM');
        const input = new TextInputBuilder().setCustomId('msg_image').setLabel("URL da Imagem").setStyle(TextInputStyle.Short).setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async savePartnersDmImage(interaction) {
        let url = interaction.fields.getTextInputValue('msg_image');
        if (url === '${null}') url = null;
        if (url && !url.startsWith('http')) return interaction.reply({ content: 'URL inválida.', ephemeral: true });
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.dmMessage.image': url } });
        await interaction.deferUpdate();
        await this.showPartnersDmConfig(interaction);
    },

    async showPartnersEditDmThumbnailModal(interaction) {
        const modal = new ModalBuilder().setCustomId('config_modal_partners_dm_thumbnail').setTitle('Editar Thumbnail DM');
        const input = new TextInputBuilder().setCustomId('msg_thumbnail').setLabel("URL da Thumbnail").setStyle(TextInputStyle.Short).setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async savePartnersDmThumbnail(interaction) {
        let url = interaction.fields.getTextInputValue('msg_thumbnail');
        if (url === '${null}') url = null;
        if (url && !url.startsWith('http')) return interaction.reply({ content: 'URL inválida.', ephemeral: true });
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.dmMessage.thumbnail': url } });
        await interaction.deferUpdate();
        await this.showPartnersDmConfig(interaction);
    },

    async showPartnersEditDmButtonModal(interaction) {
        const modal = new ModalBuilder().setCustomId('config_modal_partners_dm_button').setTitle('Adicionar/Remover Botão DM');
        const nameInput = new TextInputBuilder().setCustomId('btn_name').setLabel("Nome do Botão").setStyle(TextInputStyle.Short).setRequired(true);
        const urlInput = new TextInputBuilder().setCustomId('btn_url').setLabel("URL (ou ${null} para remover)").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(urlInput));
        await interaction.showModal(modal);
    },

    async savePartnersDmButton(interaction) {
        const name = interaction.fields.getTextInputValue('btn_name');
        const url = interaction.fields.getTextInputValue('btn_url');
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        let buttons = config.partners?.dmMessage?.buttons || [];

        if (url === '${null}') {
            buttons = buttons.filter(b => b.name !== name);
        } else if (name === '${null}') {
            buttons = [];
        } else {
            if (!url.startsWith('http')) return interaction.reply({ content: 'URL inválida.', ephemeral: true });
            const existingIndex = buttons.findIndex(b => b.name === name);
            if (existingIndex >= 0) buttons[existingIndex].url = url;
            else {
                if (buttons.length >= 5) return interaction.reply({ content: 'Máximo de 5 botões.', ephemeral: true });
                buttons.push({ name, url });
            }
        }

        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.dmMessage.buttons': buttons } });
        await interaction.deferUpdate();
        await this.showPartnersDmConfig(interaction);
    },

    // RULES
    async togglePartnersRule(interaction, rule) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const currentState = config.partners?.rules?.[rule] ?? false;
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { [`partners.rules.${rule}`]: !currentState } });
        await this.showPartnersRulesConfig(interaction);
    },

    async showPartnersEditLimitModal(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const modal = new ModalBuilder().setCustomId('config_modal_partners_limit').setTitle('Limite Diário');
        const input = new TextInputBuilder().setCustomId('limit_input').setLabel("Número (0 = sem limite)").setStyle(TextInputStyle.Short).setValue(String(config.partners?.rules?.dailyLimit || 0)).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    async savePartnersLimit(interaction) {
        const limit = parseInt(interaction.fields.getTextInputValue('limit_input'));
        if (isNaN(limit) || limit < 0) return interaction.reply({ content: 'Número inválido.', ephemeral: true });
        await GuildConfig.updateOne({ guildId: interaction.guild.id }, { $set: { 'partners.rules.dailyLimit': limit } });
        await interaction.deferUpdate();
        await this.showPartnersRulesConfig(interaction);
    },
    
    // ... Implementação dos Modals e Testes para Parcerias ...
    async testPartnership(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const p = config.partners;
        const pub = p.publicMessage;
        const dm = p.dmMessage;

        // Mock data for preview
        const repUser = interaction.user;
        const guildName = "Servidor Exemplo";
        const inviteCode = "https://discord.gg/exemplo";
        const count = 10;

        const parse = (text) => {
            if (!text) return null;
            return text
                .replace(/\${rep}/g, repUser.toString())
                .replace(/\${rep.username}/g, repUser.username)
                .replace(/\${rep.id}/g, repUser.id)
                .replace(/\${promoter}/g, interaction.user.toString())
                .replace(/\${promoter.username}/g, interaction.user.username)
                .replace(/\${promoter.id}/g, interaction.user.id)
                .replace(/\${guild}/g, guildName)
                .replace(/\${invite}/g, inviteCode)
                .replace(/\${count}/g, count);
        };

        // Public Embed Preview
        const publicEmbed = new EmbedBuilder()
            .setTitle(parse(pub.title) || '🤝 Nova parceria registrada!')
            .setDescription(parse(pub.description) || `Uma nova parceria foi realizada.\n\n👤 Representante: ${repUser}\n📣 Promovida por: ${interaction.user}\n🌍 Servidor parceiro: ${guildName}\n\nSeja bem-vindo e sucesso para as comunidades!`)
            .setColor(pub.color || '#3498DB')
            .setTimestamp();

        if (pub.footer) publicEmbed.setFooter({ text: parse(pub.footer) });
        if (pub.image) publicEmbed.setImage(pub.image);
        if (pub.thumbnail) publicEmbed.setThumbnail(pub.thumbnail);

        let content = '';
        if (p.pingRoleId) content += `(Ping no cargo <@&${p.pingRoleId}>)`;

        // DM Embed Preview
        const dmEmbed = new EmbedBuilder()
            .setTitle(parse(dm.title) || '🤝 Parceria confirmada!')
            .setDescription(parse(dm.description) || `Olá ${repUser}!\n\nUma parceria foi registrada envolvendo o servidor ${guildName}.\n\nVocê foi definido como representante dessa parceria.\nSe precisar de algo, procure quem realizou a parceria no servidor.\n\nDesejamos sucesso para ambas as comunidades!`)
            .setColor(dm.color || '#3498DB')
            .setTimestamp();

        if (dm.footer) dmEmbed.setFooter({ text: parse(dm.footer) });
        if (dm.image) dmEmbed.setImage(dm.image);
        if (dm.thumbnail) dmEmbed.setThumbnail(dm.thumbnail);

        const dmComponents = [];
        if (dm.buttons && dm.buttons.length > 0) {
            const row = new ActionRowBuilder();
            dm.buttons.forEach(btn => {
                row.addComponents(new ButtonBuilder().setLabel(btn.name).setStyle(ButtonStyle.Link).setURL(btn.url));
            });
            dmComponents.push(row);
        }

        await interaction.reply({ 
            content: `🔍 **Preview do Sistema de Parcerias**\n\n📢 **Mensagem Pública:**\n${content}`,
            embeds: [publicEmbed],
            ephemeral: true 
        });
    },

    async testPartnersDm(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const p = config.partners;
        const dm = p.dmMessage;

        // Mock data
        const repUser = interaction.user;
        const guildName = "Servidor Exemplo";
        
        const parse = (text) => {
            if (!text) return null;
            return text
                .replace(/\${rep}/g, repUser.toString())
                .replace(/\${rep.username}/g, repUser.username)
                .replace(/\${rep.id}/g, repUser.id)
                .replace(/\${guild}/g, guildName);
        };

        if (!p.dmEnabled) {
            return interaction.reply({ content: `📩 **DM do Representante está DESATIVADA.**`, ephemeral: true });
        }

        const dmEmbed = new EmbedBuilder()
            .setTitle(parse(dm.title) || '🤝 Parceria confirmada!')
            .setDescription(parse(dm.description) || `Olá ${repUser}!\n\nUma parceria foi registrada envolvendo o servidor ${guildName}.\n\nVocê foi definido como representante dessa parceria.\nSe precisar de algo, procure quem realizou a parceria no servidor.\n\nDesejamos sucesso para ambas as comunidades!`)
            .setColor(dm.color || '#3498DB')
            .setTimestamp();

        if (dm.footer) dmEmbed.setFooter({ text: parse(dm.footer) });
        if (dm.image) dmEmbed.setImage(dm.image);
        if (dm.thumbnail) dmEmbed.setThumbnail(dm.thumbnail);

        const dmComponents = [];
        if (dm.buttons && dm.buttons.length > 0) {
            const row = new ActionRowBuilder();
            dm.buttons.forEach(btn => {
                row.addComponents(new ButtonBuilder().setLabel(btn.name).setStyle(ButtonStyle.Link).setURL(btn.url));
            });
            dmComponents.push(row);
        }

        await interaction.reply({
            content: `📩 **Preview da DM do Representante:**`,
            embeds: [dmEmbed],
            components: dmComponents,
            ephemeral: true
        });
    },

    // --- PREVIEW / TEST ---

    async testWelcomeMessage(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const w = config.welcome;

        // Parsing variables
        const parse = (text) => {
            if (!text) return null;
            return text
                .replace(/\${user}/g, interaction.user.toString())
                .replace(/\${user.name}/g, interaction.user.username)
                .replace(/\${user.globalName}/g, interaction.user.globalName || interaction.user.username)
                .replace(/\${user.id}/g, interaction.user.id)
                .replace(/\${guild.name}/g, interaction.guild.name)
                .replace(/\${guild.memberCount}/g, interaction.guild.memberCount)
                .replace(/\${user.avatar}/g, interaction.user.displayAvatarURL({ dynamic: true }))
                .replace(/<#id_do_canal>/g, w.channelId ? `<#${w.channelId}>` : '#canal');
        };

        const content = w.notifyMember ? `${interaction.user.toString()}` : null;
        const roleMention = w.notifyRoleId ? `<@&${w.notifyRoleId}>` : null;
        
        // Construct the content string carefully
        let finalContent = '';
        if (content) finalContent += content + ' ';
        if (roleMention) finalContent += roleMention;
        finalContent = finalContent.trim();

        if (w.useEmbed) {
            const embed = new EmbedBuilder()
                .setTitle(parse(w.title || null))
                .setDescription(parse(w.message))
                .setColor(w.color)
                .setTimestamp();
            
            if (w.footer) embed.setFooter({ text: parse(w.footer) });
            if (w.imageUrl) embed.setImage(w.imageUrl);
            
            let thumbUrl = w.thumbnailUrl;
            // Handle specific placeholder for thumbnail
            if (thumbUrl === '${user.avatar}') thumbUrl = interaction.user.displayAvatarURL({ dynamic: true });
            if (thumbUrl && thumbUrl.startsWith('http')) embed.setThumbnail(thumbUrl);

            const components = [];
            if (w.buttons && w.buttons.length > 0) {
                const row = new ActionRowBuilder();
                w.buttons.forEach(btn => {
                    row.addComponents(new ButtonBuilder().setLabel(btn.name).setStyle(ButtonStyle.Link).setURL(btn.url));
                });
                components.push(row);
            }

            const payload = { 
                content: finalContent.length > 0 ? finalContent : null, 
                embeds: [embed], 
                components, 
                ephemeral: true 
            };
            
            // If content is null, don't send it.
            if (!payload.content) delete payload.content;

            await interaction.reply(payload);
        } else {
            // Text only
            const msgContent = parse(w.message);
            const fullContent = [finalContent, msgContent].filter(Boolean).join('\n');
            
            await interaction.reply({ 
                content: fullContent, 
                ephemeral: true 
            });
        }
    },

    async testLeaveMessage(interaction) {
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        const l = config.leave || {};

        // Parsing variables
        const parse = (text) => {
            if (!text) return null;
            return text
                .replace(/\${user}/g, interaction.user.toString())
                .replace(/\${user.name}/g, interaction.user.username)
                .replace(/\${user.globalName}/g, interaction.user.globalName || interaction.user.username)
                .replace(/\${user.id}/g, interaction.user.id)
                .replace(/\${guild.name}/g, interaction.guild.name)
                .replace(/\${guild.memberCount}/g, interaction.guild.memberCount)
                .replace(/\${user.avatar}/g, interaction.user.displayAvatarURL({ dynamic: true }))
                .replace(/<#id_do_canal>/g, l.channelId ? `<#${l.channelId}>` : '#canal');
        };

        if (l.useEmbed) {
            const embed = new EmbedBuilder()
                .setTitle(parse(l.title || null))
                .setDescription(parse(l.message))
                .setColor(l.color || '#E74C3C')
                .setTimestamp();
            
            if (l.footer) embed.setFooter({ text: parse(l.footer) });
            if (l.imageUrl) embed.setImage(l.imageUrl);
            
            let thumbUrl = l.thumbnailUrl;
            if (thumbUrl === '${user.avatar}') thumbUrl = interaction.user.displayAvatarURL({ dynamic: true });
            if (thumbUrl && thumbUrl.startsWith('http')) embed.setThumbnail(thumbUrl);

            const payload = { 
                embeds: [embed], 
                ephemeral: true 
            };

            await interaction.reply(payload);
        } else {
            // Text only
            const msgContent = parse(l.message);
            
            await interaction.reply({ 
                content: msgContent, 
                ephemeral: true 
            });
        }
    }
};
