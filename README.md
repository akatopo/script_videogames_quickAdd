# Video games Script for Obsidian's Quickadd plugin

## Demo

https://github.com/akatopo/script_videogames_quickAdd/assets/2387645/e23622b1-cc24-400a-97c9-7c5642a5c245

## Description

Based on the [work](https://github.com/Elaws/script_videogames_quickAdd) of Elaws.

This script allows you to easily insert a video game note into your Obsidian vault using [Quickadd plugin](https://github.com/chhoumann/quickadd) by @chhoumann. **Now also works on Mobile (make sure you use latest QuickAdd) !**

We use IGDB api to get the game information.

This script needs a **client id** and **client secret** for IGDB API that you can get [here](https://api-docs.igdb.com/#about). Steps to obtain **client id** and **client secret** are detailed [below](#how-to-obtain-client-id-and-secret).

## Disclaimer

The script and this tutorial are based on [Macro_MovieAndSeriesScript.md](https://github.com/chhoumann/quickadd/blob/master/docs/Examples/Macro_MovieAndSeriesScript.md) by @chhoumann.

**Please never run a script that you don't understand. I cannot and will not be liable for any damage caused by the use of this script. Regularly make a backup of your Obsidian's vault !**

## How to obtain client ID and secret.

1. Sign-in to this website : https://dev.twitch.tv/login.
2. Click on "Applications" :

![1](https://user-images.githubusercontent.com/52013479/151679962-4f510da2-bdb4-49d0-82f9-baaacb7bb4f6.png)

3. Click on "Register your application" :

![2](https://user-images.githubusercontent.com/52013479/151679974-093dc027-3d17-4ba4-8225-44f6eb5a7262.png)

4. In "Name", choose a name you want. In "OAuth Redirect URLs", write `http://localhost`. In "category", choose "Application Integration". Finally, click on "Create" :

![3](https://user-images.githubusercontent.com/52013479/151680007-4a96a8df-d6a2-483f-bab6-0f5454d909af.png)

5. Click on manage :

![4](https://user-images.githubusercontent.com/52013479/151680012-2d453d2b-6e1a-4e1e-8feb-2c6067f9cdfd.png)

6. Here are your `client id` and `client secret` ! To generate `client secret`, click on `new secret` (and copy it, it will disappear !) :

![5](https://user-images.githubusercontent.com/52013479/151680023-a243939d-b208-4a25-a256-a4bc49092a95.png)

7. Keep your `client id` and `client secret`, they will be needed in the steps [below](#installation).

## Installation

![igdbInstall](https://user-images.githubusercontent.com/52013479/150051891-f9330609-8521-402a-97f1-3288bb4186f3.gif)

1. Make sure you use latest QuickAdd version (at least 0.5.1) !
2. Save the [script](src/script_videogames_quickAdd.js) to your vault somewhere. Make sure it is saved as a JavaScript file, meaning that it has the `.js` at the end.
3. Create a new template in your designated templates folder. Example template is provided below.
4. Open the Macro Manager by opening the QuickAdd plugin settings and clicking `Manage Macros`.
5. Create a new Macro - you decide what to name it.
6. Add the user script to the command list.
7. Add a new Template step to the macro. This will be what creates the note in your vault. Settings are as follows:
   1. Set the template path to the template you created.
   2. Enable File Name Format and use `{{VALUE:fileName}}` as the file name format. You can specify this however you like. The `fileName` value is the name of game without illegal file name characters.
   3. The remaining settings are for you to specify depending on your needs.
8. Click on the cog icon to the right of the script step to configure the script settings. This should allow you to enter the API client id and client secret you got from IGDB. **Please make sure no accidental spaces are inserted before or after API `client id` or `client secret` !**
9. You can also set the path where game posters will be downloaded (the default is the vault root) and toggle clipboard data being used for game search.
10. Go back out to your QuickAdd main menu and add a new Macro choice. Again, you decide the name. This is what activates the macro.
11. Attach the Macro to the Macro Choice you just created. Do so by clicking the cog ⚙ icon and selecting it.

You can now use the macro to create notes with game information in your vault !

### Example template

Please also find a definition of the variables used in this template below (see : [Template variable definitions](#template-variable-definitions)).

```
---
title: {{VALUE:title}}
platforms: {{VALUE:platforms}}
developer: {{VALUE:developer}}
developerLogo: {{VALUE:developerLogoUrl}}
genre: {{VALUE:genres}}
modes: {{VALUE:gameModes}}
keywords: {{VALUE:keywords}}
aliases: {{VALUE:aliases}}
franchises: {{VALUE:franchises}}
poster: {{VALUE:posterPath}}
year: {{VALUE:year}}
releaseDate: {{VALUE:releaseDate}}
createdAt: {{DATE}}
igdbId: {{VALUE:igdbId}}
igdbUrl: {{VALUE:igdbUrl}}
igdbPoster: {{VALUE:posterUrl}}
websites: {{VALUE:websites}}
---

# {{VALUE:templateTitle}}

{{VALUE:templateDeveloper}}

{{VALUE:templatePoster}}

## Storyline

{{VALUE:templateStoryline}}
```

## Dataview rendering

Here is the dataview query used in the demo. Replace `from #gamedb` with whatever [source](https://blacksmithgu.github.io/obsidian-dataview/queries/data-commands/#from) is relevant to you:

```
table without id
	choice(poster, embed(link(poster)), "![](" + igdbPoster + ")") as Poster,
	link(file.link, title) as Title,
	choice(year, string(year), "N/A") as Year,
	choice(developer, "by " + developer, "N/A") as Developer
from #gamedb
where poster != null or igdbPoster != null
```

## Template variable definitions

Please find here a definition of the possible variables to be used in your template. Simply write `{{VALUE:name}}` in your template, and replace `name` by the desired video game data, including :

| Name                | Description                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fileName`          | The title of the game followed by release year in parentheses without illegal characters. Can be used in template configuration to name your file.                                                              |
| `title`             | The title of the game, single-quoted for use in properties.                                                                                                                                                     |
| `templateTitle`     | The title of the game without any quoting or escaping, for use in the note body.                                                                                                                                |
| `posterUrl`         | The poster url of the game (if available).                                                                                                                                                                      |
| `igdbUrl`           | The igdb url of the game.                                                                                                                                                                                       |
| `igdbId`            | The igdb id of the game.                                                                                                                                                                                        |
| `platforms`         | A list of platforms the game appeared on (if available). Single quoted and using the `[[Link]]` syntax, for use in properties.                                                                                  |
| `genres`            | A list of genres the game conforms to (if available). Single quoted and using the `[[Link]]` syntax, for use in properties.                                                                                     |
| `keywords`          | A list of keywords that apply to the game (if available). Single quoted and using the `[[Link]]` syntax, for use in properties.                                                                                 |
| `franchises`        | A list of franchises the game belongs to (if available). Single quoted and using the `[[Link]]` syntax, for use in properties.                                                                                  |
| `aliases`           | A list of aliases for the game's title (if available). Single quoted and using the `[[Link]]` syntax, constructed from the `alternative_names` and `name` fields from the igdb response. For use in properties. |
| `gameModes`         | A list of modes the game supports (if available). Single quoted and using the `[[Link]]` syntax, for use in properties.                                                                                         |
| `developer`         | The game's developer (if available), single-quoted and using the `[[Link]]` syntax for use in properties.                                                                                                       |
| `templateDeveloper` | The game's developer (if available), without any quoting or escaping, for use in the note body.                                                                                                                 |
| `developerLogoUrl`  | The game's developer logo URL.                                                                                                                                                                                  |
| `year`              | The game's release year (if available).                                                                                                                                                                         |
| `releaseDate`       | The game's release date in `YYYY-MM-DD` format (if available).                                                                                                                                                  |
| `websites`          | A list of websites related to the game (if available). For use in properties.                                                                                                                                   |
| `templateStoryline` | The game's storyline (if available), newlines removed for use in the note body.                                                                                                                                 |
| `posterPath`        | The vault path where the game's poster was downloaded (if successful).                                                                                                                                          |
| `templatePoster`    | Either an embed using the downloaded poster path or an inline link with the poster url if the former failed, for use in the note body.                                                                          |
