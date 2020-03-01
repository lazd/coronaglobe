# CoronaGlobe
> 3D heatmap of the COVID-19 coronavirus

Deployed at https://blog.lazd.net/coronaglobe/

## Running the project

### Development

Before following these instructions, install [yarn](https://classic.yarnpkg.com/en/docs/install/).

#### 1. Clone and init submodules

```
git clone --recursive git@github.com:yourfork/coronaglobe.git
```

If you've already cloned without `--recrusive`, run:

```
git submodule init
git submodule update
```
#### 2. Install dependencies

```
yarn install
```

#### 3. Start developing

```
open http://localhost:1234
yarn dev
```

### Production

To create a production build in `dist/`:

```
yarn build
```

### Updating

To fetch, load, and commit and push new data, run:

```
yarn fetch
yarn load
yarn push
```

### Deployment

To fetch, load, and commit new data, build, and deploy, run:

```
yarn update
```

To deploy code changes only, run:

```
yarn deploy
```

## Technology

This project is built with simple, old-school web technology, but the magic comes from the following projects:

* [three.js](https://threejs.org/): 3D library
* [webgl-heatmap](https://github.com/pyalot/webgl-heatmap): Heatmap drawn with WebGL shaders
* [Parcel](https://parceljs.org/): Web application bundler

## Acknowledgements

This project wouldn't be possible without [John Hopkins University](https://systems.jhu.edu/research/public-health/ncov/)'s reseach and coronavirus data. Their freely available [CSSEGISandData/COVID-19](https://github.com/CSSEGISandData/COVID-19) is the source of data for this project.

Huge thanks to [James Hastings-Trew's Planetary Pixel Emporium](http://planetpixelemporium.com/earth.html) for his amazing 4K Earth textures.

Thanks to [@yonet](https://github.com/yonet/) for [TweetMigration](https://github.com/yonet/TweetMigration), which was used as the basis for this project.

## License

This project is licensed under the permissive [BSD 2-clause license](LICENSE).
