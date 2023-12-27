/* globals Notice, request, requestUrl, moment */

const notice = (msg) => new Notice(msg, 5000);
// const log = (msg) => console.log(msg);

const API_URL = 'https://api.igdb.com/v4/games';
const AUTH_URL = 'https://id.twitch.tv/oauth2/token';
const GRANT_TYPE = 'client_credentials';

const API_CLIENT_ID_OPTION = 'IGDB API Client ID';
const API_CLIENT_SECRET_OPTION = 'IGDB API Client secret';
const POSTER_SAVE_PATH_OPTION = 'Vault directory path for game posters';

let userData = { igdbToken: '' };
let AUTH_TOKEN;

let QuickAdd;
let Settings;
let tokenPath;

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
    },
  },
};

async function tryDownloadPoster({ posterUrl, gameName, basePath = '' }) {
  const { normalizePath } = QuickAdd.obsidian;
  const { vault } = QuickAdd.app;

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
    formatList(array?.map((item) => item[prop]) ?? [], linkify);

const listFromNameProp = listFromProp('name');
const listFromUrlProp = listFromProp('url');

// For possible image size options, see : https://api-docs.igdb.com/#images
const getPosterUrl = (url) =>
  typeof url === 'string' ? `https:${url.replace('thumb', 'cover_big')}` : ' ';

async function start(params, settings) {
  QuickAdd = params;
  Settings = settings;

  const { configDir } = QuickAdd.app.vault;
  const { normalizePath } = QuickAdd.obsidian;
  tokenPath = normalizePath(`${configDir}/igdbToken.json`);

  // Retrieve saved token or create and save one (in Obsidian's system directory as igdbToken.json)
  // Token is generated from client ID and client secret, and lasts 2 months.
  // Token is refreshed when request fails because of invalid token (every two months)
  await readAuthToken();

  const query = await QuickAdd.quickAddApi.inputPrompt(
    'Enter videogame title: ',
  );
  if (!query) {
    notice('No query entered.');
    throw new Error('No query entered.');
  }

  const searchResults = await getByQuery(query);
  const selectedGame = await QuickAdd.quickAddApi.suggester(
    searchResults.map(formatTitleForSuggestion),
    searchResults,
  );

  if (!selectedGame) {
    notice('No choice selected.');
    throw new Error('No choice selected.');
  }

  const transformers = {
    name: undefined,
    posterUrl: (_, { cover }) => getPosterUrl(cover?.url),
    igdbUrl: 'url',
    igdbId: 'id',
    fileName: (_, { name, first_release_date }) => {
      const releaseYear = getReleaseYear(first_release_date);
      const releaseYearStr =
        typeof releaseYear === 'number' ? ` (${releaseYear})` : '';

      return sanitizeFilename(`${name}${releaseYearStr}`);
    },
    platforms: listFromNameProp,
    genres: listFromNameProp,
    keywords: listFromNameProp,
    franchises: (f) =>
      listFromNameProp(
        f?.map((item) => ({ ...item, name: `${item.name} (Franchise)` })) ?? [],
      ),
    aliases: (_, { name, alternative_names = [] }) =>
      listFromNameProp([...alternative_names, { name }], false),
    gameModes: (_, { game_modes }) => listFromNameProp(game_modes),
    developer: (_, { involved_companies }) => {
      const developer = getDeveloper(involved_companies).trim();
      return developer ? `"[[${sanitizeFilename(developer)}]]"` : ' ';
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
    storyline: (s) => s?.replace(/\r?\n|\r/g, ' ') ?? ' ',
  };

  const variables = pick(selectedGame, transformers);
  const { posterUrl } = variables;
  const posterPath =
    (await tryDownloadPoster({
      posterUrl,
      gameName: variables.name,
      basePath: settings[POSTER_SAVE_PATH_OPTION],
    })) || ' ';

  QuickAdd.variables = {
    original: selectedGame,
    ...variables,
    posterPath,
    templatePoster: posterPath.trim()
      ? `![[${posterPath}]]`
      : `![](${posterUrl})`,
  };
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

async function getByQuery(query) {
  const searchResults = await apiGet(query);

  if (searchResults.message) {
    await refreshAuthToken();
    return await getByQuery(query);
  }

  if (searchResults.length === 0) {
    notice('No results found.');
    throw new Error('No results found.');
  }

  return searchResults;
}

function formatList(list, linkify = true) {
  if (list.length === 0 || list[0] == 'N/A') {
    return ' ';
  }
  const decorate = (s) => (linkify ? `"[[${sanitizeFilename(s)}]]"` : s);

  return `\n${list.map((item) => `  - ${decorate(item.trim())}`).join('\n')}`;
}

function sanitizeFilename(string) {
  return string.replace(/[\\,#%&{}/*<>$":@.|^[]]*/g, '');
}

async function readAuthToken() {
  if (await QuickAdd.app.vault.adapter.exists(tokenPath)) {
    userData = JSON.parse(await QuickAdd.app.vault.adapter.read(tokenPath));
    AUTH_TOKEN = userData.igdbToken;
  } else {
    await refreshAuthToken();
  }
}

async function refreshAuthToken() {
  const authResults = await getAuthentified();
  if (!authResults.access_token) {
    notice('Auth token refresh failed.');
    throw new Error('Auth token refresh failed.');
  }
  AUTH_TOKEN = authResults.access_token;
  userData.igdbToken = authResults.access_token;
  await QuickAdd.app.vault.adapter.write(tokenPath, JSON.stringify(userData));
}

async function getAuthentified() {
  const finalURL = new URL(AUTH_URL);

  finalURL.searchParams.append('client_id', Settings[API_CLIENT_ID_OPTION]);
  finalURL.searchParams.append(
    'client_secret',
    Settings[API_CLIENT_SECRET_OPTION],
  );
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

async function apiGet(query) {
  try {
    const res = await request({
      url: API_URL,
      method: 'POST',
      cache: 'no-cache',
      headers: {
        'Client-ID': Settings[API_CLIENT_ID_OPTION],
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      // The understand syntax of request to IGDB API, read the following :
      // https://api-docs.igdb.com/#examples
      // https://api-docs.igdb.com/#game
      // https://api-docs.igdb.com/#expander
      body: `fields franchises.name, websites.url, keywords.name,
					platforms.name, first_release_date, involved_companies.developer,
					involved_companies.company.name, involved_companies.company.logo.url,
					url, cover.url, genres.name, game_modes.name, storyline, name, alternative_names.name;
				search "${query}";
				limit 15;
			`,
    });

    return JSON.parse(res);
  } catch (error) {
    if (error.status === 401) {
      await refreshAuthToken();
      return await getByQuery(query);
    }
    throw error;
  }
}
