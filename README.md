# 🦊 MEUBOTFOXHOUND - Mapa do Projeto

Este arquivo serve como a **memória central** do bot. Ele detalha a arquitetura, o banco de dados e os processos de deploy para garantir que qualquer manutenção futura seja consistente.

---

## 🏗️ Arquitetura do Sistema

O bot utiliza uma estrutura modular baseada em **Discord.js v14** e **Node.js**.

1.  **`index.js`**: Ponto de entrada. Gerencia o login, inicializa o servidor Express (para manter o bot vivo), carrega o scheduler e os handlers. Possui lógica de **Auto-Deploy** para diferenciar ambiente Local de Hospedagem (MonkeyBytes). Inclui sistema de **Status Rotativo** e **Contador Global de Comandos**.
2.  **`database.js`**: Camada de persistência usando **MongoDB Atlas** com **Mongoose**. Centraliza todos os Schemas e métodos de acesso a dados, incluindo `GlobalConfig` para contadores.
3.  **`handlers/`**:
    *   `interactionHandler.js`: Processa todos os comandos slash e botões.
    *   `memberHandler.js`: Gerencia eventos de entrada/saída de membros.
4.  **`commands/`**: Comandos divididos por categorias (Economia, Moderação, Utilitários).
5.  **`scheduler.js`**: Gerencia tarefas periódicas (como rotação da loja ou atualizações automáticas).
6.  **`systems/petSystem.js`**: Gerencia o ciclo de vida dos pets (fome, diversão, morte).
7.  **`systems/missionSystem.js`**: Gerencia missões diárias, geração de tarefas e verificação de conclusão.

---

## 🗄️ Banco de Dados (MongoDB)

O bot foi migrado de SQLite para **MongoDB Atlas** para maior estabilidade em hospedagens.

### Schemas Principais:
*   **Users**: Salva saldo (carteira/banco), inventário, timestamps de cooldowns (`work`, `daily`, etc.), `activePetId`, `loan` (empréstimos) e progresso de missões (`dailyMissions`).
*   **Pets**: Armazena informações dos pets (nome, nível, status, dono, etc.).
*   **GuildConfigs**: Configurações específicas de cada servidor (canais de boas-vindas, logs, etc.).
*   **GlobalConfigs**: Variáveis globais (ex: `last_instance_start`, `total_commands_used`).

---

## ⌨️ Sistema de Comandos

O bot possui um sistema híbrido que suporta **Slash Commands** e **Prefix Commands**.

### 1. Slash Commands (/)
*   Registrados globalmente via `deploy-commands-global.js`.
*   Suportam autocomplete e menus de seleção.
*   Contribuem para o **Contador Global de Comandos**.

### 2. Prefix Commands (f!)
*   Definido no `.env` (Padrão: `f!`).
*   Funcionam em qualquer canal onde o bot tenha permissão de leitura.
*   Também incrementam o **Contador Global de Comandos**.

### Como criar um novo comando compatível:
Sempre que criar um novo arquivo em `commands/`, siga este modelo para que ele funcione automaticamente com ambos os sistemas:

```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nome')
        .setDescription('Descrição'),
    
    // Execução via Slash (/)
    async execute(interaction) {
        await interaction.reply('Olá via Slash!');
    },

    // Execução via Prefixo (f!)
    async executePrefix(message, args) {
        await message.reply('Olá via Prefixo!');
    }
};
```

---

## ⚔️ Sistema de Duelos (PvP/PvE)

O bot possui um sistema robusto de duelos com apostas ou amistosos.

### Modalidades
*   **Apostado**: Os jogadores apostam uma quantia (ex: `f!duelo @user 1000`). O vencedor leva tudo (menos 5% de taxa da casa).
*   **Amistoso**: Sem aposta (`f!duelo @user 0` ou apenas `f!duelo @user`). O vencedor ganha **Honra**.
*   **Contra IA**: É possível jogar contra a máquina (`f!duelo ai`).

### 🎖️ Sistema de Honra
*   A **Honra** é uma estatística que conta quantas vezes um jogador venceu duelos amistosos contra outros jogadores.
*   **Importante**: Vitórias contra a **IA (Inteligência Artificial)** NÃO contabilizam honra. A honra é exclusiva para PvP (Player vs Player).
*   A honra é exibida no perfil do usuário (`/perfil`).

### Minigames Disponíveis
1.  **Roleta Russa**: Sorte e estratégia com itens (lupa, algemas, cerveja, cigarro). Inspirado em *Buckshot Roulette*.
2.  **Corrida**: Um jogo de tabuleiro onde você escolhe entre correr (rápido mas perigoso) ou andar (lento e seguro).
3.  **Par ou Ímpar**: Clássico rápido para decidir disputas.
4.  **Pedra, Papel e Tesoura**: Outro clássico de decisão.
5.  **Dados (Dice)**: Quem tirar o maior número vence.
6.  **Pênaltis**: Chute e defesa (Esquerda, Meio, Direita).

### Revanche
*   Após o fim de um duelo, os jogadores podem pedir revanche.
*   Em **1v1**, a aposta é dobrada automaticamente.
*   Em **Multiplayer (3+)**, a aposta se mantém a mesma.
*   Todos os jogadores originais devem aceitar para a revanche começar.

### ⏱️ Regras de Timeout (Inatividade)
Para manter a fluidez dos jogos e evitar lobbies "fantasmas":
1.  **Lobby**: Se um jogador criar um lobby (Duelo ou PPT) e ninguém entrar em **1 minuto**, o lobby é cancelado automaticamente.
    *   *Exceção*: Se houver pelo menos 1 jogador além do host, o lobby permanece aberto.
2.  **Partida**: Durante o jogo, se um jogador não realizar sua jogada em **1 minuto**, ele perde por **W.O.** (Walkover).
    *   **Consequência**: O oponente (que estava aguardando) é declarado vencedor e leva o prêmio.
    *   *Exceção*: Se nenhum dos dois jogadores tiver feito uma jogada (ex: início de Par ou Ímpar), o jogo é cancelado e as apostas reembolsadas.

---

## 💸 Sistema de Empréstimos

O sistema de empréstimos permite que jogadores emprestem dinheiro uns aos outros com juros e prazos definidos, criando uma dinâmica econômica de confiança e risco.

### Fluxo de Funcionamento
1.  **Solicitação (Mutuário)**:
    *   O jogador vai até o perfil de outro usuário (`/perfil @usuario`) e clica no botão **"Pedir Empréstimo"**.
    *   Ele preenche apenas o **Valor Desejado**.
2.  **Definição de Termos (Agiota)**:
    *   O credor recebe uma DM com a solicitação.
    *   Ele clica em **"Definir Termos"** e estipula:
        *   **Juros (%)**: De 0 a 100%.
        *   **Prazo (dias)**: De 1 a 7 dias.
3.  **Fechamento do Contrato**:
    *   O mutuário recebe a proposta final (Valor + Juros = Total).
    *   Se **Aceitar**, o dinheiro é transferido automaticamente da carteira/banco do credor para a carteira do mutuário.
    *   Se **Recusar**, a negociação é cancelada.

### Gerenciamento (`/emprestimo`)
O comando `/emprestimo` abre um painel completo para gerenciar suas finanças:
*   **Minha Dívida**: Veja o status do seu empréstimo atual (Valor, Vencimento, Credor).
*   **Cobrar / Perdoar**: Lista todos os usuários que te devem dinheiro.
    *   **Cobrar**: Envia um lembrete amigável na DM do devedor.
    *   **Perdoar**: Cancela a dívida (o dinheiro não é devolvido, mas a dívida some).
*   **Histórico**: Veja seus últimos 5 empréstimos (como credor ou devedor).

### ⚠️ Regras e Penalidades
*   **Score de Crédito**: É necessário ter no mínimo **300 pontos** de Score para pedir empréstimos.
*   **Nome Sujo**: Usuários com dívidas atrasadas ficam com status **"CALOTEIRO"** no perfil e não podem pedir novos empréstimos até quitar a pendência.
*   **Juros Diários**: Após o vencimento, são aplicados juros diários automáticos sobre o valor total.

---

## 🛡️ God Mode (Painel do Desenvolvedor)

O comando `/godmode` é uma ferramenta administrativa exclusiva para o dono do bot (definido no `.env` via `OWNER_ID`).

### Funcionalidades Principais:

1.  **Painel Interativo:** Interface moderna com botões e modais para gerenciar o bot sem digitar comandos complexos.
2.  **Gestão de Usuários (por ID):**
    *   **Ver Perfil Completo:** Visualize saldo, banco, status de procurado, penas e banimentos de qualquer usuário, mesmo que ele não esteja no servidor.
    *   **Aplicar/Remover Penas:** Adicione ou remova "Trabalho Forçado" (minutos) ou "Banimento" (blacklist) do bot.
    *   **Editar Economia:** Defina valores exatos para a carteira e o banco de qualquer usuário.
    *   **Dar/Remover Itens:** Adicione ou remova itens do inventário de qualquer usuário pelo ID.
3.  **Transmissão Global:** Envie mensagens oficiais do desenvolvedor para os canais de log de economia de todos os servidores onde o bot está.
4.  **Pagamento em Massa:** Distribua moedas para TODOS os usuários registrados no banco de dados de uma só vez (Cuidado: Inflação!).
5.  **Pagamento Direto:** Envie moedas para um usuário específico sem taxas.

### Privilégios do Dono (God Mode Ativo):
Quando o dono está com o God Mode ativado (Hide Rank + Carteira > 900M):
*   **Isenção de Taxas:** Nenhuma taxa é cobrada em transferências, saques ou depósitos.
*   **Sem Limites:**
    *   **Banco:** Pode depositar acima do limite da patente.
    *   **Loja:** Pode comprar itens sem limite de estoque diário ou de inventário.
    *   **Transferências:** Pode enviar qualquer valor sem limite diário.
*   **Bypass de Vault:** As taxas (que seriam cobradas) não são enviadas para o Cofre Global, evitando inflação artificial dos fundos do bot durante testes.

---

## 🐾 Sistema de Pets

O sistema de pets foi expandido com um módulo de **Batalhas por Turno**, permitindo que os jogadores evoluam seus companheiros através do combate.

### Funcionalidades de Batalha:
*   **Combate por Turno**: Lógica clássica de RPG onde cada pet possui atributos (Vida, Ataque, Defesa, Velocidade) baseados em sua raridade e nível.
*   **Atributos Dinâmicos**:
    *   **Vida (HP)**: Resistência a danos.
    *   **Ataque (ATK)**: Potência dos golpes.
    *   **Defesa (DEF)**: Redução de dano recebido.
    *   **Velocidade (SPD)**: Define quem ataca primeiro e chance de esquiva.
    *   **Sorte (LUCK)**: Chance de acerto crítico.
*   **Risco Real**:
    *   Pets derrotados em batalha têm **10% de chance de morrer** permanentemente (o save é deletado).
    *   Vitórias garantem XP e moedas.

### Integração:
*   Acesse o menu de batalha através do comando `/pet` e o botão **"⚔️ Duelar"**.
*   Selecione um oponente no menu suspenso (apenas usuários com pets ativos aparecem).

---

## 🎰 Otimização de Apostas (Casino)

Os comandos de aposta foram refatorados para proporcionar uma experiência mais fluida e limpa no chat, reduzindo o spam de mensagens.

### Comandos Otimizados:
*   **`/coinflip` (Cara ou Coroa)**
*   **`/hilo` (High-Low)**
*   **`/slots` (Caça-Níqueis)**

### Melhorias:
*   **Edição de Embeds**: Ao clicar em **"Jogar Novamente"** ou **"2x Aposta"**, o bot atualiza a mensagem existente com o novo resultado, em vez de enviar uma nova mensagem.
*   **Limpeza Automática**: Botões desativados ou interações finalizadas são removidos ou atualizados instantaneamente para evitar poluição visual.
*   **Proteção de Estado**: Controles de fluxo impedem cliques duplos ou interações em jogos já finalizados.
#   F O X H O U N D  
 