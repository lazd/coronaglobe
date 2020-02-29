import * as THREE from 'three';
import util from './gt.util.js';

const Marker = function(options) {
	this.data = options.data;

	var geometry = new THREE.SphereGeometry(options.size || 0.5);
	var material = new THREE.MeshPhongMaterial({
		color: 'orange',
		transparent: true,
		opacity: 0.5
	});

	this.mesh = new THREE.Mesh(geometry, material);
	this.mesh.position.copy(util.latLongToVector3(options.location[0], options.location[1], options.radius));

	options.scene.add(this.mesh)
};

export default Marker;