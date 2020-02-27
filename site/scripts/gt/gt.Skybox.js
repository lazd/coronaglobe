import * as THREE from 'three/build/three.module.js';
import util from './gt.util.js';

const Skybox = function(options) {
	util.extend(this, Skybox.defaults, options);

	// console.log(require('url:../../textures/skybox/Purple_Nebula_right1.png'));

	var urls = [
		require('url:../../textures/skybox/Purple_Nebula_right1.png'), require('url:../../textures/skybox/Purple_Nebula_left2.png'),
		require('url:../../textures/skybox/Purple_Nebula_top3.png'), require('url:../../textures/skybox/Purple_Nebula_bottom4.png'),
		require('url:../../textures/skybox/Purple_Nebula_front5.png'), require('url:../../textures/skybox/Purple_Nebula_back6.png')
	];

	let loader = THREE.CubeTextureLoader();
	let textureCube = new THREE.CubeTextureLoader()
		.load(urls);

  textureCube.format = THREE.RGBFormat;
  this.scene.background = textureCube;
};

Skybox.defaults = {
	size: 30000
};

export default Skybox;
