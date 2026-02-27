const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');

// Helper para substituir placeholders na mensagem
function formatMessage(content, member, guild, channelId) {
    if (!content) return "";
    let msg = content;
    
    msg = msg.replace(/\${user}/g, `<@${member.id}>`);
    msg = msg.replace(/\${user\.name}/g, member.user.username);
    msg = msg.replace(/\${user\.globalName}/g, member.user.globalName || member.user.username);
    msg = msg.replace(/\${user\.id}/g, member.id);
    msg = msg.replace(/\${guild\.name}/g, guild.name);
    msg = msg.replace(/\${guild\.memberCount}/g, guild.memberCount);
    msg = msg.replace(/\${user\.avatar}/g, member.user.displayAvatarURL({ dynamic: true }));
    msg = msg.replace(/<#id_do_canal>/g, channelId ? `<#${channelId}>` : '#canal');
    msg = msg.replace(/\${null}/g, "");
    
    return msg;
}

module.exports = {
    handleMemberAdd: async (member) => {
        const guildConfig = await db.getGuildConfig(member.guild.id);

        if (!guildConfig || !guildConfig.welcome || !guildConfig.welcome.enabled) return;

        const { welcome } = guildConfig;
        if (!welcome.channelId) return;

        const channel = member.guild.channels.cache.get(welcome.channelId) || await member.guild.channels.fetch(welcome.channelId).catch(() => null);
        if (!channel) return;

        // Verificar permissões
        const permissions = channel.permissionsFor(member.guild.members.me);
        if (!permissions || !permissions.has('SendMessages')) return;

        // Processar variáveis
        let content = formatMessage(welcome.message || "Bem-vindo ${user}!", member, member.guild, welcome.channelId);
        const payload = {};

        // Preparar menções (FORA do embed)
        let mentions = '';
        if (welcome.notifyMember) {
            mentions += `<@${member.id}>`;
        }
        if (welcome.notifyRoleId) {
            mentions += ` <@&${welcome.notifyRoleId}>`;
        }
        mentions = mentions.trim();

        if (welcome.useEmbed) {
            const embed = new EmbedBuilder()
                .setTitle(formatMessage(welcome.title || '👋 Bem-vindo(a)!', member, member.guild, welcome.channelId))
                .setDescription(content) // Removido o "> " para ser consistente com o preview
                .setColor(welcome.color || '#2ECC71')
                .setTimestamp();
            
            // Processar rodapé
            if (welcome.footer && welcome.footer !== '') {
                let footerText = formatMessage(welcome.footer, member, member.guild, welcome.channelId);
                embed.setFooter({ text: footerText });
            }
            
            if (welcome.imageUrl && welcome.imageUrl !== '${null}' && welcome.imageUrl !== '') {
                let imgUrl = welcome.imageUrl
                    .replace(/\${user\.avatar}/g, member.user.displayAvatarURL({ dynamic: true }))
                    .replace(/\${guild\.icon}/g, member.guild.iconURL({ dynamic: true }) || '');
                if (imgUrl.startsWith('http')) embed.setImage(imgUrl);
            }
            
            let thumbUrl = welcome.thumbnailUrl;
            if (thumbUrl === '${user.avatar}') thumbUrl = member.user.displayAvatarURL({ dynamic: true });
            if (thumbUrl && thumbUrl !== '${null}' && thumbUrl !== '') {
                 // Replace other variables if needed, though usually just user.avatar
                 thumbUrl = thumbUrl.replace(/\${user\.avatar}/g, member.user.displayAvatarURL({ dynamic: true }));
                 if (thumbUrl.startsWith('http')) embed.setThumbnail(thumbUrl);
            }

            payload.embeds = [embed];
            
            // Enviar menções FORA do embed, na mesma mensagem
            if (mentions) {
                payload.content = mentions;
            }
        } else {
            // Texto simples
            if (mentions) {
                payload.content = `${mentions}\n${content}`;
            } else {
                payload.content = content;
            }
            
            // Add image URL to content if text mode
            if (welcome.imageUrl && welcome.imageUrl !== '${null}' && welcome.imageUrl !== '') {
                let imgUrl = welcome.imageUrl.replace(/\${user\.avatar}/g, member.user.displayAvatarURL({ dynamic: true }));
                if (!payload.content.includes(imgUrl) && imgUrl.startsWith('http')) {
                    payload.content += `\n${imgUrl}`;
                }
            }
        }

        // Botões
        if (welcome.buttons && welcome.buttons.length > 0) {
            const row = new ActionRowBuilder();
            welcome.buttons.forEach(btn => {
                if (btn.url && btn.url.startsWith('http')) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setLabel(btn.name)
                            .setStyle(ButtonStyle.Link)
                            .setURL(btn.url)
                    );
                }
            });
            if (row.components.length > 0) {
                payload.components = [row];
            }
        }

        // Configurar menções permitidas
        payload.allowedMentions = {
            parse: ['users', 'roles'],
            repliedUser: false
        };

        await channel.send(payload).catch(err => console.error('Erro ao enviar boas-vindas:', err));
    },

    handleMemberRemove: async (member) => {
        const guildConfig = await db.getGuildConfig(member.guild.id);

        if (!guildConfig || !guildConfig.leave || !guildConfig.leave.enabled) return;

        const { leave } = guildConfig;
        if (!leave.channelId) return;

        const channel = member.guild.channels.cache.get(leave.channelId) || await member.guild.channels.fetch(leave.channelId).catch(() => null);
        if (!channel) return;

        // Verificar permissões
        const permissions = channel.permissionsFor(member.guild.members.me);
        if (!permissions || !permissions.has('SendMessages')) return;

        // Processar variáveis
        let content = formatMessage(leave.message || "${user.name} saiu do servidor.", member, member.guild, leave.channelId);
        const payload = {};

        // Preparar menções para saída (FORA do embed)
        let mentions = '';
        if (leave.notifyRoleId) {
            mentions += `<@&${leave.notifyRoleId}>`;
        }
        mentions = mentions.trim();

        if (leave.useEmbed) {
            const embed = new EmbedBuilder()
                .setTitle(formatMessage(leave.title || '🚪 Até logo!', member, member.guild, leave.channelId))
                .setDescription(content)
                .setColor(leave.color || '#E74C3C')
                .setTimestamp();
            
            // Processar rodapé
            if (leave.footer && leave.footer !== '') {
                let footerText = formatMessage(leave.footer, member, member.guild, leave.channelId);
                embed.setFooter({ text: footerText });
            }
            
            if (leave.imageUrl && leave.imageUrl !== '${null}' && leave.imageUrl !== '') {
                let imgUrl = leave.imageUrl
                    .replace(/\${user\.avatar}/g, member.user.displayAvatarURL({ dynamic: true }))
                    .replace(/\${guild\.icon}/g, member.guild.iconURL({ dynamic: true }) || '');
                if (imgUrl.startsWith('http')) embed.setImage(imgUrl);
            }
            
            let thumbUrl = leave.thumbnailUrl;
            if (thumbUrl === '${user.avatar}') thumbUrl = member.user.displayAvatarURL({ dynamic: true });
            if (thumbUrl && thumbUrl !== '${null}' && thumbUrl !== '') {
                 thumbUrl = thumbUrl.replace(/\${user\.avatar}/g, member.user.displayAvatarURL({ dynamic: true }));
                 if (thumbUrl.startsWith('http')) embed.setThumbnail(thumbUrl);
            }

            payload.embeds = [embed];
            
            // Enviar menções FORA do embed
            if (mentions) {
                payload.content = mentions;
            }
        } else {
            // Texto simples
            if (mentions) {
                payload.content = `${mentions}\n${content}`;
            } else {
                payload.content = content;
            }
            
            if (leave.imageUrl && leave.imageUrl !== '${null}' && leave.imageUrl !== '') {
                let imgUrl = leave.imageUrl.replace(/\${user\.avatar}/g, member.user.displayAvatarURL({ dynamic: true }));
                if (!payload.content.includes(imgUrl) && imgUrl.startsWith('http')) {
                    payload.content += `\n${imgUrl}`;
                }
            }
        }

        // Configurar menções permitidas
        payload.allowedMentions = {
            parse: ['users', 'roles'],
            repliedUser: false
        };

        await channel.send(payload).catch(err => console.error('Erro ao enviar saída:', err));
    }
};
