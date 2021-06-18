const Utils = {};

Utils.parseAuthenticationCredentials = cred => {
	try {
		return JSON.parse(Buffer.from(
			String(cred).replace("Basic ", "").trim()
		, 'base64').toString('ascii'));
	} catch {
		return null;
	}
};

module.exports = Utils;