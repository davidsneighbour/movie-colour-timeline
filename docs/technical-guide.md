# Technical guide

[Return to the command guide](../README.md).

## Principles

Analysis and artwork are separate. The saved analysis is the source for later renders, so changing image dimensions does not require reading the film again. The timeline shows the dominant colour over time, the palette summarises sampled colour frequency, and the hero is chosen manually. All processing runs locally. Palette selection and border detection use configurable heuristics.

## How the analysis works

1. FFprobe reads the first video stream's duration and geometry. FFmpeg honours rotation metadata and normalises sample aspect ratio before cropping and resizing.
2. `samples` sets a resolution-independent count. Each sample is taken at the midpoint of an equal time interval: `start + (index + 0.5) × (end − start) / samples`. This avoids requesting a frame at the exact end of the video. Timestamps are requested seek times, rather than decoded frame presentation timestamps; frame rate and FFmpeg seeking can move the actual selected frame slightly.
3. FFmpeg seeks and extracts each frame, downsizing it to `analysisWidth`. Auto cropping ignores contiguous near-black rows and columns at the frame's edges. Detection runs separately for each sample, which handles changing letterboxing. It never removes more than `maxCropFraction` from an edge, and retains entirely dark frames. Dark scene content can still resemble a black border: inspect the recorded rectangles and use `crop: "none"` or a manual rectangle when necessary.
4. Remaining pixels are converted from sRGB to OKLab. Deterministic k-means, initialised with farthest points, creates up to `frameClusters` groups. The largest group supplies the sample colour. Its centroid represents a perceptual cluster, so it may not be an exact pixel colour from the frame. `dominance` records the fraction of analysed pixels in that group. Black scene content remains a legitimate colour.
5. The dominant sample colours are clustered again in OKLab to build the main palette. Each sample also retains all of its frame clusters and their pixel-area fractions. This allows an accent to be found even if it never dominates a whole frame.
6. Palette selection begins at `paletteMin`, tries successively larger sizes, and accepts another cluster only when the relative reduction in mean squared OKLab error meets `paletteImprovement`. It stops when the error reaches `paletteErrorFloor`, improvement is too small, or `paletteMax` is reached. The JSON stores the trials. This is an improvement heuristic, rather than a claim that every film has a unique statistical palette size. Flat or low-variety films can have fewer than three colours because duplicate and empty clusters are removed.
7. Optional accent selection examines frame clusters whose nearest main palette colour is at least `accentDistance` away in OKLab. It groups these residual colours within a fixed OKLab radius of 0.04, rejects groups without enough frame support or total area, and repeatedly selects the supported group farthest from the current palette. It adds up to `accentMax` colours, within the total `paletteMax` limit. This is a configurable heuristic, and the distance thresholds are starting values for tuning, rather than universal perceptual cut-offs. Setting `accentMax` to zero disables it.
8. Frame clusters are reassigned to the nearest selected palette colour. Each sampled frame contributes equal total weight, and its clusters contribute their pixel-area fractions. New palette percentages therefore describe approximate pixel area across sampled time (`pixel-time`), rather than just the dominant-colour frequency. The assigned groups use fixed representative colours to preserve the chosen accents. `count` records the number of sampled frames that contribute to a colour; these counts can overlap between colours. Colours are sorted by their recalculated weights.
9. Each rendered pixel column uses the nearest sample at that position in time. Wider images repeat sample colours without inventing intermediate hues; narrower images select fewer samples and can omit brief colour changes. Render width never changes the canonical analysis.

The conversion matrices follow [Björn Ottosson's OKLab reference](https://bottosson.github.io/posts/oklab/). Frame extraction, scaling, and cropping use the [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html) and [FFmpeg command-line documentation](https://ffmpeg.org/ffmpeg.html).

## Palette updates and layout

`repalette` updates the existing JSON atomically, preserves the hero choice and samples, and merges configuration overrides with its saved settings. It changes the palette and saved palette-selection settings; it does not rerun extraction, cropping, or frame clustering, so changes to those settings require a fresh analysis. The shared `iterations` setting is used for this recalculation if supplied, but its saved extraction value is preserved. Back up the JSON first if you want to keep the previous palette.

For an older version 1 analysis, this command can discover accents among the saved dominant colours. It prints a warning because colours that never dominated a frame cannot be recovered. Those older files retain `dominant-time` percentages. To capture within-frame accents, analyse the original movie again into a new directory. The timeline continues to use the dominant sample colours in both versions.

The layout reserves `paletteMinWidth` pixels for each block, then distributes the remaining width in proportion to `weight ** paletteWidthExponent`. The default exponent of 0.5 takes the square root. An exponent of zero makes equal blocks; an exponent of one gives linear frequency weighting. With `paletteMinWidth: 0`, these are the exact normalised power weights. If the image is narrower than the total minimum space, the blocks divide the available width equally, and the labels shrink to fit. The displayed percentage is always the actual analysis weight, independent of display width.

## Typography

The title uses Barlow Semi Condensed Light (300), and the palette labels use Regular (400). This slightly rounded, narrow sans-serif was chosen for its technical signage character. The family is available from [Fontsource](https://fontsource.org/fonts/barlow-semi-condensed/about), and its [designer describes its signage influences](https://github.com/jpt/barlow). Its SIL Open Font License is included in the [Fontsource package](https://cdn.jsdelivr.net/npm/@fontsource/barlow-semi-condensed@5.3.0/LICENSE).

The visible title and hex labels are uppercase. The supplied title remains unchanged in the SVG's accessible title metadata. The title's visible outlines sit 16 pixels from the left and bottom hero edges by default; this represents 1rem at a 16-pixel base size. A dark fade behind the bottom of the hero improves contrast without adding a separate title panel. Title and label sizes are measured from the actual glyphs and reduced only when needed to fit the available space. Short titles use the full 84-pixel default size. Both label lines use the same fitted size.

The renderer loads Fontsource's Latin and Latin extended files locally, shapes the lettering with Fontkit, and writes vector paths into the SVG. This preserves the chosen font in browsers, image editors, and FFmpeg PNG exports that might otherwise substitute a system font. Outlined lettering cannot be edited as ordinary text in an image editor; change the CLI title or configuration and render again. Unsupported characters, such as emoji or scripts outside these font subsets, produce an explicit error instead of replacement boxes. No system font installation is needed.

## Files and data

```text
src/
  cli.ts        Command parsing and errors
  config.ts     Defaults and configuration validation
  media.ts      FFmpeg/FFprobe processes, frames, and border detection
  colour.ts     OKLab conversion, clustering, and palette selection
  analysis.ts   Sampling, JSON persistence, and candidate gallery
  render.ts     Timeline and banner rendering
  typography.ts Fontsource letter shaping and portable SVG outlines
test/           Numerical, crop, configuration, and CLI integration tests
config.example.json
```

`analysis.json` now has `schemaVersion: 2` and `algorithm: "oklab-kmeans-v2"`. Version 1 files remain readable. It stores the absolute input path, SHA-256 fingerprint, file size, geometry, duration, effective analysis settings, analysis range, all sample timestamps and colours (sRGB and OKLab), dominance fractions, crop rectangles, per-frame `clusters` with OKLab centres and area weights, palette weights and trial errors, main/accent roles, the palette `weightBasis`, candidate paths and timestamps, and the nullable hero candidate ID. Colour arrays use sRGB integers from 0 to 255; OKLab uses floating-point values. Palette weights sum to one. Candidate paths are relative to the JSON directory. Move the JSON together with its `candidates` directory to keep banner rendering functional. Timeline rendering needs only the JSON. The source fingerprint records provenance; rendering does not recheck the original movie.

The canonical JSON is written through a temporary file and renamed only after analysis and candidate extraction finish. Analysis refuses to replace an existing `analysis.json`. A failed run can leave candidate files; use a fresh output directory for a clean retry. Do not run multiple writers against the same output directory. The source file is read without modification. The pipeline runs locally and does not upload frames or film data.

## Errors and limits

The CLI exits with status 1 and an error message for missing inputs, invalid configuration, missing tools, unsupported or corrupt media, missing frames, subprocess timeouts, malformed JSON, and unavailable hero candidates. FFmpeg diagnostics are included when extraction fails. Inputs must be local files with a finite duration and a decodable first video stream. Rotation must be a multiple of 90 degrees. The source should remain unchanged throughout analysis.

The present pipeline targets normal SDR material. It does not provide explicit HDR tone mapping or colour-management guarantees for every transfer function; normalise HDR material to SDR before analysing it. Automatic border detection is a heuristic, and the small analysis frames can hide fine detail. Candidate choices are evenly spaced; increase `candidateCount` or narrow `start` and `end` if the desired shot is missing. Extraction errors stop the run instead of silently substituting a colour.

## Resource limits

The title sits over the hero image, with no separate title strip. The remaining banner height after the timeline and palette must leave space for the hero and title inset. Resource limits reject very large configuration values; PNG timelines are capped at 32 million pixels, and each media subprocess output is capped at 128 MiB. Analysis is sequential to bound memory use. More samples improve temporal detail but require more individual seeks. All configuration lives in `src/config.ts`, with an external example file; there are no hidden environment requirements.

## Verification

`npm test` checks primary-colour OKLab round trips, deterministic majority clustering, natural palette selection, dark-frame preservation, chronological resampling, configuration rejection, supported and isolated accent colours, frequency-based block widths, version 1 palette updates, rotation and sample aspect ratio, and an end-to-end CLI run on generated letterboxed footage. The integration test verifies recorded crops, palette size, hero persistence, embedded banner imagery, escaped and uppercase titles, outlined labels, hero/timeline placement, PNG dimensions, and failure paths. Font checks verify actual glyph outlines, full title size, fitting, Latin extended characters, and unsupported-character errors. The automated suite uses generated SDR footage. The eight social presets were also rendered from the local Alien analysis, their PNG dimensions were checked, and portrait and wide examples were visually inspected. The local Alien data is excluded from Git and is not required by the tests.

## Synthetic example

```sh
mkdir -p demo
ffmpeg -v error -y -f lavfi -i 'testsrc2=size=640x360:rate=12:duration=4' -vf 'pad=640:440:0:40:black' -c:v ffv1 demo/source.mkv
node dist/cli.js analyse demo/source.mkv --out demo/analysis --config demo/config.json
node dist/cli.js select demo/analysis/analysis.json --candidate 2
node dist/cli.js render demo/analysis/analysis.json --out demo/artwork --config demo/config.json --title 'A study in moving colour'
```

The render command creates both banner formats. The standalone banner SVG contains the hero image and font outlines.
