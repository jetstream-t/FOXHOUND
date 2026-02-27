// Sistema de gerenciamento de estado para interações
class InteractionStateManager {
    constructor() {
        this.acknowledgedInteractions = new Set();
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // Limpar a cada minuto
    }

    // Marcar interação como acknowledged
    markAcknowledged(interactionId) {
        this.acknowledgedInteractions.add(interactionId);
    }

    // Verificar se interação já foi acknowledged
    isAcknowledged(interactionId) {
        return this.acknowledgedInteractions.has(interactionId);
    }

    // Limpar interações antigas (mais de 5 minutos)
    cleanup() {
        const now = Date.now();
        for (const interactionId of this.acknowledgedInteractions) {
            const timestamp = parseInt(interactionId.split('_')[1]);
            if (now - timestamp > 300000) { // 5 minutos
                this.acknowledgedInteractions.delete(interactionId);
            }
        }
    }

    // Gerar ID único para interação
    generateId(interaction) {
        return `${interaction.user.id}_${Date.now()}`;
    }

    // Fazer deferUpdate seguro
    async safeDeferUpdate(interaction) {
        const id = this.generateId(interaction);
        
        if (this.isAcknowledged(id)) {
            return false; // Já foi acknowledged
        }

        try {
            await interaction.deferUpdate();
            this.markAcknowledged(id);
            return true;
        } catch (error) {
            if (error.code === 40060 || error.code === 'InteractionAlreadyReplied') {
                this.markAcknowledged(id);
                return false;
            }
            throw error;
        }
    }

    // Fazer update seguro
    async safeUpdate(interaction, options) {
        const id = this.generateId(interaction);
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(options);
            } else {
                await interaction.update(options);
            }
            return true;
        } catch (error) {
            if (error.code === 40060 || error.code === 'InteractionAlreadyReplied') {
                // Tentar followUp como fallback
                try {
                    await interaction.followUp({
                        ...options,
                        ephemeral: true
                    });
                    return true;
                } catch (followUpError) {
                    console.error('Erro no fallback followUp:', followUpError);
                    return false;
                }
            }
            throw error;
        }
    }
}

// Exportar instância singleton
const interactionState = new InteractionStateManager();
module.exports = interactionState;
