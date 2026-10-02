# Movie colour timeline

Turn a local video into a colour timeline, a palette, and artwork with a manually selected hero frame. Save the analysis once, then render new sizes and layouts without reading the video again.

For the analysis principles, algorithms, file format, typography, limitations, and test coverage, see the [technical guide](docs/technical-guide.md).

## Setup

Use Node.js 22 or later, npm, FFmpeg, and FFprobe. Both media tools must be on your executable path, or set in the configuration. Banner PNG export requires an FFmpeg build with SVG decoding support. No system font installation is needed.

On Debian or Ubuntu:

```sh
sudo apt install ffmpeg
```

In the project directory:

```sh
npm ci
npm run build
```

## Create artwork

Run these steps in order. Quote paths that contain spaces. Configuration is optional; copy [config.example.json](config.example.json) to your own file to change the defaults.

1. Analyse the video into a new directory:

   ```sh
   node dist/cli.js analyse '/path/to/movie.mp4' --out art/my-film --config config.example.json
   ```

2. Open `art/my-film/candidates.html` in your browser, choose a frame, and save its candidate ID:

   ```sh
   node dist/cli.js select art/my-film/analysis.json --candidate 4
   ```

3. Render the artwork:

   ```sh
   node dist/cli.js render art/my-film/analysis.json --out art/my-film/render --config config.example.json --title 'My film'
   ```

The analysis directory contains `analysis.json`, `candidates.html`, and the `candidates/` images. Rendering produces `timeline.svg`, `timeline.png`, `banner.svg`, and `banner.png`. Before selecting a hero, rendering produces only the timeline files. Each banner SVG is standalone.

## Commands and options

```text
analyse VIDEO --out DIRECTORY [--config FILE]
select ANALYSIS.json --candidate ID
repalette ANALYSIS.json [--config FILE]
render ANALYSIS.json --out DIRECTORY [--config FILE] [--title TEXT] [--social]
```

| Option | Purpose |
| --- | --- |
| `--out DIRECTORY` | Required for analysis and rendering; sets the output directory |
| `--config FILE` | JSON settings for analysis, palette updates, or rendering |
| `--candidate ID` | Required for selection; use an ID from the candidate gallery |
| `--title TEXT` | Banner title; defaults to `Film colour study` |
| `--social` | Adds all eight social presets unless custom exports are configured |
| `--help` | Shows command usage |

## Re-render existing data

Change the title or rendering settings, then run `render` again. The original video is not needed. Keep `analysis.json` together with its `candidates/` directory.

```sh
node dist/cli.js render art/my-film/analysis.json --out art/my-film/render-v2 --config render-config.json --title 'My film'
```

Render settings use application defaults plus the supplied configuration; they do not inherit settings from the saved analysis. Use the original configuration if you want the same layout. Choose a new output directory to keep previous artwork. Rendering into the same directory replaces matching files, but does not remove old exports.

To change the hero, run `select` with another candidate ID, then render again. To change palette selection, back up the analysis if needed, then run:

```sh
node dist/cli.js repalette art/my-film/analysis.json --config palette-config.json
node dist/cli.js render art/my-film/analysis.json --out art/my-film/render-v2 --config render-config.json --title 'My film'
```

`repalette` preserves the samples and hero selection, and updates the palette in the saved JSON. It inherits saved analysis settings before applying your overrides. Changes to sampling, cropping, frame clustering, or candidate extraction require a new `analyse` run into a new directory.

## Social image exports

Add `--social` to render all eight aspect ratios:

```sh
node dist/cli.js render art/my-film/analysis.json --out art/my-film/social --title 'My film' --social
```

The usual files are created, plus `banner-NAME.svg` and `banner-NAME.png` for each preset. Portrait presets use two palette columns and multiple rows. All colours, hex values, and percentages are retained, with lettering resized to fit.

| Name | Aspect ratio | Size in pixels |
| --- | --- | --- |
| `1x1` | 1:1 | 1080 × 1080 |
| `4x5` | 4:5 | 1080 × 1350 |
| `9x16` | 9:16 | 1080 × 1920 |
| `40x21` | 40:21 | 1200 × 630 |
| `851x315` | 851:315 | 851 × 315 |
| `3x1` | 3:1 | 1500 × 500 |
| `16x9` | 16:9 | 1920 × 1080 |
| `4x1` | 4:1 | 1600 × 400 |

These are export presets, rather than current platform requirements.

### Custom exports

For individual compositions, add an `exports` array to a configuration file. A non-empty array takes precedence over `--social` and is rendered even without that flag. An empty array keeps the normal single-banner behaviour unless `--social` is supplied. Names become filename suffixes and must be unique letters, digits, underscores, or hyphens, starting with a letter or digit.

```json
{
  "exports": [
    {
      "name": "portrait",
      "width": 1080,
      "height": 1350,
      "paletteColumns": 2,
      "timelineHeight": 180,
      "paletteHeight": 300,
      "titlePosition": "top-right",
      "heroPosition": "xMaxYMid"
    }
  ]
}
```

`paletteHeight` is the total height of all palette rows. By default, it uses 12% of the image height, and the timeline uses one sixth. `paletteColumns` defaults to a single row, except in the built-in portrait presets. `titlePosition` accepts `top-left`, `top-centre`, `top-right`, `bottom-left`, `bottom-centre`, or `bottom-right`; its default is `bottom-left`. The contrast fade follows the title. `heroPosition` uses SVG cover alignment: combine `xMin`, `xMid`, or `xMax` with `YMin`, `YMid`, or `YMax`. Its default is `xMidYMid`. The hero is cropped to fill its area; choose its alignment separately for each export to keep the subject visible. Strip heights must leave room for the hero, and each export is limited to 32 million pixels.

## Configuration reference

Configuration files contain overrides of the defaults. Unknown keys and invalid values are rejected. Dimensions are in pixels, and times are in seconds. Crop rectangles refer to the displayed video before resizing.

| Setting | Default | Purpose |
| --- | --- | --- |
| `samples` | 480 | Number of equal time intervals, independent of output width |
| `analysisWidth` | 96 | Width of frames used for colour analysis |
| `frameClusters` | 6 | Maximum pixel clusters per frame |
| `iterations` | 24 | Maximum k-means iterations |
| `start`, `end` | 0, null | Analysis range; null uses the video duration |
| `crop` | `"auto"` | `"auto"`, `"none"`, or `{"x":0,"y":100,"width":1920,"height":880}` |
| `blackThreshold` | 20 | Maximum RGB channel value for a near-black border pixel |
| `edgeCoverage` | 0.98 | Required fraction of near-black pixels in an edge row or column |
| `maxCropFraction` | 0.25 | Maximum fraction removed from any edge |
| `paletteMin`, `paletteMax` | 3, 8 | Preferred palette search range |
| `paletteImprovement` | 0.15 | Minimum relative error reduction for another colour |
| `paletteErrorFloor` | 0.0001 | Stop when mean squared OKLab error is this small |
| `accentMax` | 2 | Maximum added accent colours; zero disables them |
| `accentDistance` | 0.12 | Minimum Euclidean OKLab distance from the selected palette |
| `accentMinSamples` | 2 | Minimum number of supporting sampled frames |
| `accentMinFrameWeight` | 0.05 | Minimum frame area required for a supporting frame |
| `accentMinWeight` | 0.002 | Minimum grouped area across sampled time |
| `paletteWidthExponent` | 0.5 | Power applied to weights when allocating display width |
| `paletteMinWidth` | 80 | Reserved width per palette block, in pixels |
| `candidateCount` | 12 | Number of evenly spaced hero candidates, capped at sample count |
| `candidateWidth` | 960 | Extracted hero candidate width; increase for large banners |
| `renderWidth` | 1920 | Timeline and banner width |
| `timelineHeight` | 180 | Timeline height |
| `bannerHeight` | 1080 | Total composition height |
| `paletteHeight` | 130 | Palette strip height |
| `titleFontSize` | 84 | Preferred title size in pixels |
| `paletteFontSize` | 36 | Preferred hex and percentage size in pixels |
| `titleInset` | 16 | Distance from the visible title outlines to the left and bottom image edges |
| `exports` | `[]` | Additional image layouts; see custom exports below |
| `background` | `"#10151a"` | Banner background colour |
| `ffmpeg`, `ffprobe` | executable names | Commands or executable paths; shell expressions are not supported |
| `timeoutMs` | 120000 | Timeout for each external process |

## Troubleshooting

| Problem | Action |
| --- | --- |
| No banner files | Select a hero candidate, then render again |
| Desired shot is absent | Increase `candidateCount`, or narrow `start` and `end`, then analyse into a new directory |
| Borders or dark scene content are cropped incorrectly | Set `crop` to `"none"` or a manual rectangle, then analyse again |
| Existing analysis cannot be replaced | Use a new analysis output directory |
| Banner PNG export fails | Check that FFmpeg supports SVG decoding and read the reported diagnostic |
| Title contains unsupported characters | Use Latin or Latin extended characters; emoji and other scripts are not supported |
| Old analysis cannot recover within-frame accents | Analyse the original video again; see [palette updates](docs/technical-guide.md#palette-updates-and-layout) |

Use SDR video. HDR requires conversion to SDR before analysis. See the [technical guide](docs/technical-guide.md#errors-and-limits) for further limitations.

## Development and local files

```sh
npm run check
npm test
```

Tests require FFmpeg and FFprobe, and generate their own small video. Source videos, generated artwork, dependencies, and compiled files are excluded from Git. Keep runs in `art/`; the local `alien/` dataset is also excluded. A [synthetic example](docs/technical-guide.md#synthetic-example) is available for a fresh checkout.

## Font attribution

Barlow Semi Condensed by Jeremy Tribby and the Barlow Project Authors is supplied by `@fontsource/barlow-semi-condensed` under the SIL Open Font License 1.1. The [licence file in the package](https://cdn.jsdelivr.net/npm/@fontsource/barlow-semi-condensed@5.3.0/LICENSE) is also available locally at `node_modules/@fontsource/barlow-semi-condensed/LICENSE` after installation.
