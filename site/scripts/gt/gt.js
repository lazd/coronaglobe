import App from './gt.App.js';

const gt = {
	config: {
		playing: false,

		type: 'cases'
	},
	init: function() {
		gt.app = new App(gt.config);
	}
};

window.gt = gt;

window.addEventListener('load', gt.init);
