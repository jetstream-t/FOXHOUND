const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GuildConfig } = require('../database');

module.exports = {
    handlePartnership: async (message) => {
        if (!message.guild || message.author.bot) return;

        const config = await GuildConfig.findOne({ guildId: message.guild.id });
        if (!config || !config.partners || !config.partners.channelId) return;

        // Verificar se é o canal de parcerias
        if (message.channel.id !== config.partners.channelId) return;

        // Verificar cargo responsável (se configurado)
        if (config.partners.managerRoleId && !message.member.roles.cache.has(config.partners.managerRoleId)) {
            return;
        }

        // Detectar link de convite
        const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
        const inviteMatch = message.content.match(inviteRegex);

        // Detectar menção ao representante
        let repUser = message.mentions.users.first();
        
        // Regras: Exigir convite
        if (config.partners.rules.requireInvite && !inviteMatch) return;
        
        // Regras: Exigir representante
        if (!repUser) return;

        // 1. Obter dados do servidor parceiro
        let guildName = 'Servidor Parceiro';
        let guildIcon = null;
        let inviteCode = inviteMatch ? inviteMatch[0] : null;

        if (inviteCode) {
            // Tentar resolver o convite (pode falhar se for inválido ou bot sem permissão)
            try {
                const invite = await message.client.fetchInvite(inviteCode);
                if (invite && invite.guild) {
                    guildName = invite.guild.name;
                    guildIcon = invite.guild.iconURL({ dynamic: true });
                }
            } catch (err) {
                // Link inválido ou expirado, se regra exige válido, ignora
                if (config.partners.rules.requireInvite) return;
            }
        }

        // 2. Preparar Variáveis
        const p = config.partners;
        const pub = p.publicMessage;
        
        const count = 0; // Placeholder para contador

        const parse = (text) => {
            if (!text) return null;
            return text
                .replace(/\${rep}/g, repUser.toString())
                .replace(/\${rep.username}/g, repUser.username)
                .replace(/\${rep.id}/g, repUser.id)
                .replace(/\${promoter}/g, message.author.toString())
                .replace(/\${promoter.username}/g, message.author.username)
                .replace(/\${promoter.id}/g, message.author.id)
                .replace(/\${guild}/g, guildName)
                .replace(/\${invite}/g, inviteCode || 'https://discord.gg/')
                .replace(/\${count}/g, count);
        };

        // 3. Montar Embed Pública
        const embed = new EmbedBuilder()
            .setTitle(parse(pub.title) || '🤝 Nova parceria registrada!')
            .setDescription(parse(pub.description) || `Uma nova parceria foi realizada.\n\n👤 Representante: ${repUser}\n📣 Promovida por: ${message.author}\n🌍 Servidor parceiro: ${guildName}\n\nSeja bem-vindo e sucesso para as comunidades!`)
            .setColor(pub.color || '#3498DB')
            .setTimestamp();

        if (pub.footer) embed.setFooter({ text: parse(pub.footer) });
        if (pub.image) embed.setImage(pub.image);
        if (pub.thumbnail) embed.setThumbnail(pub.thumbnail);
        else if (guildIcon) embed.setThumbnail(guildIcon);

        // 4. Enviar Mensagem Pública
        let content = '';
        if (p.pingRoleId) content += `<@&${p.pingRoleId}>`;
        
        await message.channel.send({ content: content || null, embeds: [embed] });

        // 5. Dar cargo de parceiro
        if (p.partnerRoleId) {
            const memberRep = await message.guild.members.fetch(repUser.id).catch(() => null);
            if (memberRep) {
                await memberRep.roles.add(p.partnerRoleId).catch(err => console.error('Erro ao dar cargo de parceiro:', err));
            }
        }

        // 6. Enviar DM ao Representante
        if (p.dmEnabled) {
            const dm = p.dmMessage;
            const dmEmbed = new EmbedBuilder()
                .setTitle(parse(dm.title) || '🤝 Parceria confirmada!')
                .setDescription(parse(dm.description) || `Olá ${repUser}!\n\nUma parceria foi registrada envolvendo o servidor ${guildName}.\n\nVocê foi definido como representante dessa parceria.\nSe precisar de algo, procure quem realizou a parceria no servidor.\n\nDesejamos sucesso para ambas as comunidades!`)
                .setColor(dm.color || '#3498DB')
                .setTimestamp();

            if (dm.footer) dmEmbed.setFooter({ text: parse(dm.footer) });
            if (dm.image) dmEmbed.setImage(dm.image);
            if (dm.thumbnail) dmEmbed.setThumbnail(dm.thumbnail);

            const components = [];
            if (dm.buttons && dm.buttons.length > 0) {
                const row = new ActionRowBuilder();
                dm.buttons.forEach(btn => {
                    if (btn.url && btn.url.startsWith('http')) {
                        row.addComponents(new ButtonBuilder().setLabel(btn.name).setStyle(ButtonStyle.Link).setURL(btn.url));
                    }
                });
                if (row.components.length > 0) components.push(row);
            }

            try {
                await repUser.send({ embeds: [dmEmbed], components });
            } catch (err) {
                // DM fechada
            }
        }
    }
};
