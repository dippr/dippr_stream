const PATH_MAP = {
	"modules": "/modules"
};

const KEY_MAP = Object.keys(PATH_MAP);

global.base_dir = __dirname;
global.abs_path = function(path) {
	return base_dir + path;
}
global.include = function(file) {
	KEY_MAP.forEach(pathKey => {
		if(file.startsWith("$" + pathKey)) {
			file = file.replace("$" + pathKey, PATH_MAP[pathKey]);
		}
	});
	return require(abs_path('/' + file));
}