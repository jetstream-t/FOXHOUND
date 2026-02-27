const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serie')
    .setDescription('Comandos de séries')
    .addSubcommand(subcommand =>
      subcommand
        .setName('aleatoria')
        .setDescription('Mostra uma série aleatória')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('buscar')
        .setDescription('Busca uma série específica')
        .addStringOption(option =>
          option
            .setName('nome')
            .setDescription('Nome da série para buscar')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    if (!focusedValue) return interaction.respond([]);

    try {
      const response = await fetch(`${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(focusedValue)}&language=pt-BR`);
      const data = await response.json();

      if (!data.results) return interaction.respond([]);

      const choices = data.results.slice(0, 25).map(show => ({
        name: `${show.name} (${show.first_air_date ? show.first_air_date.split('-')[0] : 'N/A'})`,
        value: show.id.toString(),
      }));

      await interaction.respond(choices);
    } catch (error) {
      console.error('Erro no autocomplete de séries:', error);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey || apiKey === 'SUA_CHAVE_TMDB_AQUI' || apiKey.trim() === '') {
      return interaction.reply({ content: '❌ A API Key do TMDB não foi configurada corretamente no arquivo .env.', flags: 64 });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      await interaction.deferReply();
    } catch (err) {
      return;
    }

    try {
      let show;

      if (subcommand === 'aleatoria') {
        const randomPage = Math.floor(Math.random() * 500) + 1;
        const response = await fetch(`${TMDB_BASE_URL}/tv/popular?api_key=${apiKey}&language=pt-BR&page=${randomPage}`);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
          return interaction.editReply('Não foi possível encontrar uma série aleatória no momento.');
        }

        const randomIndex = Math.floor(Math.random() * data.results.length);
        const basicShow = data.results[randomIndex];
        
        const detailsResponse = await fetch(`${TMDB_BASE_URL}/tv/${basicShow.id}?api_key=${apiKey}&language=pt-BR&append_to_response=external_ids`);
        show = await detailsResponse.json();
      } else if (subcommand === 'buscar') {
        const showId = interaction.options.getString('nome');
        let finalShowId = showId;

        if (isNaN(showId)) {
          const searchResponse = await fetch(`${TMDB_BASE_URL}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(showId)}&language=pt-BR`);
          const searchData = await searchResponse.json();
          if (!searchData.results || searchData.results.length === 0) {
            return interaction.editReply(`Nenhuma série encontrada para "${showId}".`);
          }
          finalShowId = searchData.results[0].id;
        }

        const detailsResponse = await fetch(`${TMDB_BASE_URL}/tv/${finalShowId}?api_key=${apiKey}&language=pt-BR&append_to_response=external_ids`);
        show = await detailsResponse.json();
      }

      if (!show || show.success === false) {
        return interaction.editReply('Série não encontrada.');
      }

      // Buscar onde assistir (Watch Providers)
      const providersResponse = await fetch(`${TMDB_BASE_URL}/tv/${show.id}/watch/providers?api_key=${apiKey}`);
      const providersData = await providersResponse.json();
      const brProviders = providersData.results && providersData.results.BR ? providersData.results.BR : null;
      
      let providersText = "Não disponível em streamings populares no Brasil.";
      if (brProviders && brProviders.flatrate && brProviders.flatrate.length > 0) {
          providersText = brProviders.flatrate.map(p => p.provider_name).join(', ');
      }

      const embed = new EmbedBuilder()
        .setTitle(show.name)
        .setURL(`https://www.themoviedb.org/tv/${show.id}`)
        .setDescription(show.overview || 'Sem sinopse disponível.')
        .setColor(colors.default)
        .addFields(
          { name: '📅 Lançamento', value: show.first_air_date ? show.first_air_date.split('-').reverse().join('/') : 'Desconhecido', inline: true },
          { name: '⭐ Nota', value: show.vote_average ? show.vote_average.toFixed(1) : 'N/A', inline: true },
          { name: '📺 Episódios/Temporadas', value: `${show.number_of_episodes || '?'} eps / ${show.number_of_seasons || '?'} temps`, inline: true },
          { name: '🎬 Gêneros', value: show.genres ? show.genres.map(g => g.name).join(', ') : 'N/A', inline: false },
          { name: '📺 Onde Assistir (BR)', value: providersText, inline: false }
        );

      if (show.poster_path) {
        embed.setThumbnail(`${TMDB_IMAGE_BASE_URL}${show.poster_path}`);
      }
      
      if (show.backdrop_path) {
        embed.setImage(`${TMDB_IMAGE_BASE_URL}${show.backdrop_path}`);
      }

      if (show.external_ids && show.external_ids.imdb_id) {
          // Adicionar botão ou link para IMDB se quiser, mas por enquanto só o embed
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Erro ao buscar série:', error);
      await interaction.editReply('Ocorreu um erro ao buscar as informações da série.');
    }
  },
};