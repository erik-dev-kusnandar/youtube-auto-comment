exports.isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }

    // If it's an API call, return 401
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Otherwise redirect to login
    res.redirect('/login');
};

exports.isGuest = (req, res, next) => {
    if (req.session && req.session.userId) {
        return res.redirect('/');
    }
    next();
};
