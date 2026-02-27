# 📋 Sistema de Configurações Avançadas

## 🚀 Instalação

### 1. Deploy do Comando
```bash
node deploy-config-command.js
```

### 2. Reiniciar o Bot
Após o deploy, reinicie o bot para carregar o novo comando.

## 🎮 Como Usar

### Comando Principal
```
/configuracoes
```
- **Permissão necessária**: Administrador
- **Tipo**: Slash Command
- **Resposta**: Ephemeral (apenas você vê)

### Fluxo de Configuração

#### 🏠 Painel Principal
Ao usar `/configuracoes`, você verá:
- Embed com informações gerais
- Select menu para escolher categorias

#### 👋 Categoria: Entrada e Saída de Membros
1. Selecione "👋 Entrada e Saída de Membros"
2. Clique em "📥 Configurar Entrada"

#### ⚙️ Opções de Configuração

**Botões Principais:**
- 🟢/🔴 **Ativar/Desativar Mensagem** - Liga/desliga o sistema
- 🟢/🔴 **Ativar/Desativar Embed** - Alterna entre embed e texto simples
- 📢 **Selecionar Canal** - Define onde as mensagens serão enviadas
- 📝 **Título e Mensagem** - Personaliza o conteúdo
- 🖼️ **Alterar Imagem** - Configura imagem principal da embed
- 🖼️ **Thumbnail** - Configura miniatura da embed
- 📄 **Rodapé** - Adiciona texto no rodapé da embed
- 🎨 **Cor da Embed** - Define a cor (HEX ou nome)
- 🔘 **Adicionar Botão** - Cria botões de link na mensagem
- 🟢/🔴 **Notificar Membro** - Marca o novo membro na mensagem
- 👔 **Notificar Cargo** - Marca um cargo específico
- 🧪 **Testar Mensagem** - Envia preview para suas DMs

## 📝 Variáveis Disponíveis

### Para Membros
- `${user}` - Menciona o membro (@usuário)
- `${user.name}` - Nome do usuário
- `${user.globalName}` - Nome global do usuário
- `${user.id}` - ID do usuário
- `${user.avatar}` - URL do avatar do usuário

### Para Servidor
- `${guild.name}` - Nome do servidor
- `${guild.memberCount}` - Quantidade de membros
- `${guild.icon}` - URL do ícone do servidor

### Especiais
- `${null}` - Remove elemento (imagem, thumbnail, etc.)
- `<#id_do_canal>` - Menciona um canal específico

## 🔘 Sistema de Botões

### Adicionar Botões
1. Clique em "🔘 Adicionar Botão"
2. Preencha:
   - **Nome do Botão**: Texto que aparecerá (ex: "Regras")
   - **Link do Botão**: URL completa (ex: "https://discord.com/rules")

### Remover Botões
- `${null}` - Remove TODOS os botões
- `${Nome_do_botão}` - Remove um botão específico

## 🎨 Cores Suportadas

### HEX
- `#FF0000` - Vermelho
- `#00FF00` - Verde
- `#0000FF` - Azul
- etc.

### Nomes (em português)
- `vermelho`, `verde`, `azul`, `amarelo`, `roxo`, `laranja`, `preto`, `branco`, `cinza`, `rosa`, `marrom`

## 🧪 Sistema de Teste

O botão "🧪 Testar Mensagem" envia uma prévia exata de como a mensagem aparecerá para novos membros, incluindo:
- Substituição correta das variáveis
- Formatação da embed
- Funcionamento dos botões
- Menções

## 💾 Persistência

Todas as configurações são salvas automaticamente no banco de dados MongoDB e persistem entre reinicializações do bot.

## 🔐 Segurança

- Apenas administradores podem usar o comando
- Todas as interações são verificadas por usuário
- Configurações são específicas por servidor

## 🚨 Solução de Problemas

### Mensagem não aparece
1. Verifique se o sistema está ativado
2. Confirme se o canal está correto
3. Verifique as permissões do bot no canal

### Variáveis não funcionam
1. Use exatamente o formato: `${user.name}`
2. Verifique se não há espaços extras
3. Use o sistema de teste para verificar

### Botões não aparecem
1. Verifique se os links são URLs válidas
2. Confirme se não usou `${null}` acidentalmente
3. Teste com o sistema de preview

## 🔄 Atualizações Futuras

Planejado para implementar:
- Configuração de mensagens de saída
- Sistema de autoroles
- Logs de auditoria
- Mais categorias de configuração

---

## 📞 Suporte

Caso encontre algum bug ou precise de ajuda, verifique:
1. Logs do console para erros
2. Permissões do bot
3. Configurações do servidor

Desenvolvido com ❤️ para o FoxHound Bot
