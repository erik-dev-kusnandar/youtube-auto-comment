const User = require('../models/User');

exports.register = async (req, res) => {
    try {
        const { username, email, password, repeat_password } = req.body;

        if (password !== repeat_password) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const existingUsername = await User.findOne({ where: { username } });
        if (existingUsername) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        const user = await User.create({ username, email, password });

        // Auto login after register
        req.session.userId = user.id;
        res.json({ success: true, redirect: '/' });

    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ error: 'Registration failed' });
    }
};

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find by username OR email
        const user = await User.findOne({
            where: sequelize.or(
                { username: username },
                { email: username }
            )
        });

        // Need to require sequelize to use Where operators if strictly needed, 
        // but for simplicity let's just try to find by one or the other manually if OR fails or use simple logic.
        // Let's refine the query:
    } catch (e) { }
};
