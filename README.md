# Ontology Role Builder

Set up classes and properties in your Logseq DB graph without building them by hand. Choose from ready-made Schema.org presets, keep only what you need, and import the result with Logseq's own importer.

**Works with:** Logseq desktop 2.0.x and DB graphs. File-based (markdown) graphs are not supported.

## Install

1. Download `logseq-ontology-sync-plugin-vX.Y.Z.zip` from the [latest release](https://github.com/C0ntr0lledCha0s/logseq-ontology-sync-plugin/releases/latest).
2. Unzip it.
3. In Logseq, open **Settings -> Plugins**, turn on **Developer mode**, click **Load unpacked plugin**, and select the unzipped `logseq-ontology-sync-plugin` folder.

## Build a role

A *role* is the set of classes and properties you want in your graph, for example everything a CRM or project-management setup needs.

Open the builder from the toolbar icon, or run **Ontology: Open role builder** from the Command Palette.

1. **Create a role.** Choose **New role…** from the role picker and give it a name.
2. **Start from presets.** Click one or more preset chips. Your role gets everything from every preset you pick.
3. **Trim it.** Untick the classes you don't want, and the properties you don't want on each class. Use **+ add class…** to add a class that isn't in your presets. Labels show where each item came from: a preset, or added by you.
4. **Save role.** Your roles are saved in the graph, so you can come back and change them later.
5. **Export EDN.** The plugin saves an `.edn` file to your Downloads folder.
6. **Import it.** In Logseq choose **Import -> EDN to DB Graph** and select that file.

## Share a role

Click **Export role file** to save the role as a `.json` file. In another graph, click **Import role file** to load it.

## Before you export: conflicts

The plugin checks your role against the properties already in your graph. If a property exists with a different type, or allows one value where the role allows many (or the other way around), export is blocked and the clashes are listed. Change the property in Logseq, or untick it in the role, then export again.

## Things to know

- **Importing never removes anything.** If you untick items after you've already imported a role, importing again won't delete them. Remove them by hand in Logseq. The plugin warns you when this applies.
- **The preset library is downloaded from GitHub.** The first time you open the builder it needs an internet connection. After that it uses a saved copy. Click **Update library** to get the newest presets. The button highlights when a newer version is available.
- **Nothing changes until you import.** The plugin only writes files. Your classes and properties change only when you import the EDN file in Logseq.

## Help and feedback

Report problems or ideas on the [issue tracker](https://github.com/C0ntr0lledCha0s/logseq-ontology-sync-plugin/issues). Please include your Logseq version and the plugin version.

See what's new in the [changelog](CHANGELOG.md). Developer notes are in [DEVELOPMENT.md](https://github.com/C0ntr0lledCha0s/logseq-ontology-sync-plugin/blob/main/DEVELOPMENT.md).

## License

MIT. See [LICENSE](LICENSE).
