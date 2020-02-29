import * as THREE from 'three';
import util from './gt.util.js';

const Marker = function(options) {
	this.data = options.data;

	var geometry = new THREE.SphereGeometry(1);
	var material = new THREE.MeshPhongMaterial({
		specular: '#ffa500', // Light
		color: '#ffa500', // Medium
		emissive: '#110000', // Dark
		shininess: 100 
	});

	this.mesh = new THREE.Mesh(geometry, material);
	this.mesh.position.copy(util.latLongToVector3(options.location[0], options.location[1], options.radius));

	options.scene.add(this.mesh)
};

export default Marker;