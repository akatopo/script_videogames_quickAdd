/* globals Notice, request, requestUrl, moment */

const notice = (msg) => new Notice(msg, 5000);
const noticeAndThrow = (msg, cause) => {
  notice(msg);
  throw new Error(msg, { cause });
};

const API_URL = 'https://api.igdb.com/v4/games';
const AUTH_URL = 'https://id.twitch.tv/oauth2/token';
const GRANT_TYPE = 'client_credentials';

const API_CLIENT_ID_OPTION = 'IGDB API Client ID';
const API_CLIENT_SECRET_OPTION = 'IGDB API Client secret';
const POSTER_SAVE_PATH_OPTION = 'Vault directory path for game posters';
const USE_CLIPBOARD_DATA_OPTION = 'Use clipboard data for game search';

let app;
let obsidian;
let quickAddApi;

module.exports = {
  entry: start,
  settings: {
    name: 'Videogames Script',
    author: 'Elaws',
    options: {
      [API_CLIENT_ID_OPTION]: {
        type: 'text',
        defaultValue: '',
        placeholder: 'IGDB API Client ID',
      },
      [API_CLIENT_SECRET_OPTION]: {
        type: 'text',
        defaultValue: '',
        placeholder: 'IGDB API Client secret',
      },
      [POSTER_SAVE_PATH_OPTION]: {
        type: 'text',
        defaultValue: '',
        placeholder: 'ex. Games/posters',
      },
      [USE_CLIPBOARD_DATA_OPTION]: {
        type: 'checkbox',
        defaultValue: false,
      },
    },
  },
};

// release date in UNIX epoch
const getReleaseYear = (releaseDate) =>
  releaseDate ? new Date(releaseDate * 1000).getFullYear() : ' ';

const getReleaseDate = (releaseDate) =>
  releaseDate ? moment(releaseDate * 1000).format('YYYY-MM-DD') : ' ';

const getDeveloper = (companies) =>
  companies?.find((element) => element.developer)?.company?.name ?? ' ';

const listFromProp =
  (prop) =>
  (array, linkify = true) =>
    formatList(
      // keep entries unique
      Array.from(new Set(array?.map((item) => item[prop]) ?? [])),
      linkify,
    );

const listFromNameProp = listFromProp('name');
const listFromUrlProp = listFromProp('url');

// For possible image size options, see : https://api-docs.igdb.com/#images
const getPosterUrl = (url) =>
  typeof url === 'string' ? `https:${url.replace('thumb', 'cover_big')}` : ' ';

async function start(params, settings) {
  ({ app, obsidian, quickAddApi } = params);
  const {
    [API_CLIENT_ID_OPTION]: clientId,
    [API_CLIENT_SECRET_OPTION]: clientSecret,
    [POSTER_SAVE_PATH_OPTION]: posterBasePath,
    [USE_CLIPBOARD_DATA_OPTION]: shouldUseClipboard,
  } = settings;

  const { configDir } = app.vault;
  const { normalizePath } = obsidian;
  const { getClipboard } = quickAddApi.utility;
  const tokenPath = normalizePath(`${configDir}/igdbToken.json`);
  const queryPlaceholders = [
    'Leisure Suit Larry: Love for Sail!',
    'Cyberpunk 2077',
    'Shenmue',
    'Super Mario Bros. 3',
    'Daikatana',
    'Quake',
  ];
  const queryPlaceholder =
    queryPlaceholders[
      Math.floor(Math.random() * (queryPlaceholders.length - 1))
    ];

  const accessToken = await executeReadOrRefreshAccessToken(tokenPath, {
    clientId,
    clientSecret,
  });

  const query = await quickAddApi.inputPrompt(
    'Enter video game title: ',
    `ex. ${queryPlaceholder}`,
    shouldUseClipboard ? (await getClipboard()).trim() : '',
  );
  if (!query) {
    noticeAndThrow('No query entered.');
  }

  const searchResults = await executeQuery(query, {
    clientId,
    clientSecret,
    tokenPath,
    accessToken,
  });

  if (!Array.isArray(searchResults) || searchResults.length === 0) {
    noticeAndThrow('No results found.');
  }

  const selectedGame = await quickAddApi.suggester(
    searchResults.map(formatTitleForSuggestion),
    searchResults,
  );

  if (!selectedGame) {
    notice('No choice selected.');
    throw new Error('No choice selected.');
  }

  const transformers = {
    title: (_, { name }) => `'${escapeSingleQuotedYamlString(name)}'`,
    templateTitle: 'name',
    posterUrl: (_, { cover }) => getPosterUrl(cover?.url),
    igdbUrl: 'url',
    igdbId: 'id',
    fileName: (_, { name, first_release_date }) => {
      const releaseYear = getReleaseYear(first_release_date);
      const releaseYearStr =
        typeof releaseYear === 'number' ? ` (${releaseYear})` : '';

      return sanitizeFilename(`${name}${releaseYearStr}`);
    },
    platforms: (p) => listFromNameProp(p),
    genres: (g) => listFromNameProp(g),
    keywords: (k) => listFromNameProp(k),
    franchises: (f) =>
      listFromNameProp(
        f?.map((item) => ({ ...item, name: `${item.name} (Franchise)` })) ?? [],
      ),
    aliases: (_, { name, alternative_names = [] }) =>
      listFromNameProp([...alternative_names, { name }], false),
    gameModes: (_, { game_modes }) => listFromNameProp(game_modes),
    developer: (_, { involved_companies }) => {
      const developer = getDeveloper(involved_companies).trim();
      return developer ? `'[[${sanitizeFilename(developer)}]]'` : ' ';
    },
    templateDeveloper: (_, { involved_companies }) =>
      getDeveloper(involved_companies),
    developerLogoUrl: (_, { involved_companies }) => {
      const developer = involved_companies?.find(
        (element) => element.developer,
      );
      return developer?.company?.logo?.url
        ? `https:${developer.company.logo.url.replace('thumb', 'logo_med')}`
        : ' ';
    },
    year: (_, { first_release_date }) => getReleaseYear(first_release_date),
    releaseDate: (_, { first_release_date }) =>
      getReleaseDate(first_release_date),
    websites: (w) => listFromUrlProp(w, false),
    templateStoryline: (_, { storyline }) =>
      storyline?.replace(/\r?\n|\r/g, ' ') ?? ' ',
    templateSummary: (_, { summary }) =>
      summary?.replace(/\r?\n|\r/g, ' ') ?? ' ',
  };

  const variables = pick(selectedGame, transformers);
  const { posterUrl } = variables;
  const posterPath =
    (await tryDownloadPoster({
      posterUrl,
      gameName: selectedGame.name,
      basePath: posterBasePath,
    })) || ' ';

  params.variables = {
    original: selectedGame,
    ...variables,
    posterPath,
    templatePoster: posterPath.trim()
      ? `![[${posterPath}]]`
      : `![](${posterUrl})`,
  };
}

// Retrieve saved token or create and save one (in Obsidian's system directory as igdbToken.json)
// Token is generated from client ID and client secret, and lasts 2 months.
// Token is refreshed when request fails because of invalid token (every two months)

async function executeReadOrRefreshAccessToken(
  tokenPath,
  { clientId, clientSecret },
) {
  try {
    return (
      (await tryReadAccessTokenFromVault(tokenPath)) ||
      (await refreshAccessToken({ clientId, clientSecret, tokenPath }))
    );
  } catch (error) {
    noticeAndThrow('Failed to refresh access token.', { cause: error });
  }
}

async function executeQuery(
  query,
  { clientId, clientSecret, tokenPath, accessToken },
) {
  const processError = (error, shouldCheckForAuthError = true) => {
    if (!shouldCheckForAuthError || error?.status !== 401) {
      noticeAndThrow('Failed to fetch game results.', { cause: error });
    }
  };

  try {
    return await getGames(query, { clientId, accessToken });
  } catch (error) {
    processError(error);
  }

  try {
    const newAccessToken = await refreshAccessToken({
      clientId,
      clientSecret,
      tokenPath,
    });
    return await getGames(query, {
      clientId,
      accessToken: newAccessToken,
    });
  } catch (error) {
    processError(error, false);
  }
}

async function tryDownloadPoster({ posterUrl, gameName, basePath = '' }) {
  const { normalizePath } = obsidian;
  const { vault } = app;

  const lastSlashIndex = posterUrl.lastIndexOf('/');
  if (lastSlashIndex === -1) {
    return false;
  }

  const filename = posterUrl.slice(posterUrl.lastIndexOf('/'));
  const [name, ext] = filename.split(/\.(?!.*\.)/).map(sanitizeFilename);
  if (!name || !ext) {
    return false;
  }

  let sanitizedBasePath = basePath.trim();
  // strip last path separator if it exists
  sanitizedBasePath =
    sanitizedBasePath.length > 0 &&
    sanitizedBasePath[sanitizedBasePath.length - 1] === '/'
      ? sanitizedBasePath.slice(0, sanitizedBasePath.length - 1)
      : sanitizedBasePath;
  sanitizedBasePath = normalizePath(
    sanitizedBasePath
      .split('/')
      .map((segment) => sanitizeFilename(segment))
      .join('/'),
  );

  const basePathExists = await vault.adapter.exists(sanitizedBasePath);
  const targetPath = normalizePath(
    `${sanitizedBasePath}/${sanitizeFilename(gameName)}-${name}.${ext}`,
  );
  const targetPathExists = await vault.adapter.exists(targetPath);
  if (targetPathExists) {
    // assume that poster is already downloaded at this point
    return targetPath;
  }

  try {
    const { arrayBuffer } = await requestUrl({
      url: posterUrl,
      method: 'GET',
      cache: 'no-cache',
    });
    if (!basePathExists) {
      await vault.adapter.mkdir(sanitizedBasePath);
    }
    await vault.adapter.writeBinary(targetPath, arrayBuffer);
    return targetPath;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function pick(obj, propTransformers) {
  const entries = Object.entries(propTransformers).map(([key, transformer]) => {
    const value = (
      {
        string: () => obj[transformer],
        function: () => transformer(obj[key], obj, key),
      }[typeof transformer] ?? (() => obj[key])
    )();

    return [key, value];
  });

  return Object.fromEntries(entries);
}

function formatTitleForSuggestion({
  name,
  first_release_date,
  platforms: platformsFromArgs,
}) {
  const platforms = platformsFromArgs?.map((p) => p.name) ?? [];
  const platformsStr = ` [${platforms.join(', ')}]`;
  const releaseYear = getReleaseYear(first_release_date);
  return `${name}${typeof releaseYear === 'number' ? ` (${releaseYear})` : ''}${
    platforms.length > 0 ? platformsStr : ''
  }`;
}

function formatList(list, linkify = true) {
  if (list.length === 0 || list[0] === 'N/A') {
    return ' ';
  }
  const decorate = (s) =>
    linkify
      ? `'[[${escapeSingleQuotedYamlString(sanitizeFilename(s.trim()))}]]'`
      : `'${escapeSingleQuotedYamlString(s.trim())}'`;

  return `\n${list.map((item) => `  - ${decorate(item)}`).join('\n')}`;
}

function sanitizeFilename(string) {
  return string.replace(/[\\,#%&{}/*<>$":@.|^[]]*/g, '');
}

function escapeSingleQuotedYamlString(s) {
  return s.replaceAll("'", "''");
}

async function tryReadAccessTokenFromVault(tokenPath) {
  const tokenFileExists = await app.vault.adapter.exists(tokenPath);
  if (!tokenFileExists) {
    return false;
  }

  try {
    return JSON.parse(await app.vault.adapter.read(tokenPath)).igdbToken;
  } catch (error) {
    console.error(`Failed reading auth token from ${tokenPath}`);
    return false;
  }
}

async function refreshAccessToken({ clientId, clientSecret, tokenPath }) {
  const { access_token: accessToken } = await getAccessToken({
    clientId,
    clientSecret,
  });
  if (!accessToken) {
    notice('Access token refresh failed.');
    throw new Error('Access token refresh failed.');
  }

  try {
    await app.vault.adapter.write(
      tokenPath,
      JSON.stringify({ igdbToken: accessToken }),
    );
  } catch (error) {
    // FS error handling, maybe ignore and just pop a notification since we have an access token anyway
  }
  return accessToken;
}

async function getAccessToken({ clientId, clientSecret }) {
  const finalURL = new URL(AUTH_URL);
  finalURL.searchParams.append('client_id', clientId);
  finalURL.searchParams.append('client_secret', clientSecret);
  finalURL.searchParams.append('grant_type', GRANT_TYPE);

  const res = await request({
    url: finalURL.href,
    method: 'POST',
    cache: 'no-cache',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return JSON.parse(res);
}

async function getGames(query, { clientId, accessToken }) {
  const res = await request({
    url: API_URL,
    method: 'POST',
    cache: 'no-cache',
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${accessToken}`,
    },
    // The understand syntax of request to IGDB API, read the following :
    // https://api-docs.igdb.com/#examples
    // https://api-docs.igdb.com/#game
    // https://api-docs.igdb.com/#expander
    body: `fields franchises.name, websites.url, keywords.name,
          platforms.name, first_release_date, involved_companies.developer,
          involved_companies.company.name, involved_companies.company.logo.url,
          url, cover.url, genres.name, game_modes.name, storyline, summary, name, alternative_names.name;
        search "${query}";
        limit 15;
      `,
  });

  return JSON.parse(res);
}
