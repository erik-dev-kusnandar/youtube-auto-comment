const User = require('../models/User');
const { Op } = require('sequelize');

exports.register = async (req, res) => {
    try {
        const { username, email, password, repeat_password } = req.body;

        if (password !== repeat_password) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        const existingUser = await User.findOne({
            where: {
                [Op.or]: [{ email }, { username }]
            }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Username or Email already taken' });
        }

        const user = await User.create({ username, email, password });

        req.session.userId = user.id;
        req.session.username = user.username; // ✅ Store username
        res.json({ success: true, redirect: '/' });

    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ error: 'Registration failed' });
    }
};

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({
            where: {
                [Op.or]: [
                    { username: username },
                    { email: username }
                ]
            }
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValid = await user.validPassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.userId = user.id;
        req.session.username = user.username; // ✅ Store username
        res.json({ success: true, redirect: '/' });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ error: 'Login failed' });
    }
};

exports.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out' });
        }
        res.json({ success: true, redirect: '/login' });
    });
};

exports.getMe = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const user = await User.findByPk(req.session.userId, {
            attributes: ['id', 'username', 'email', 'role'] // Exclude password
        });
        res.json(user);
    } catch (error) {
        console.error("GetMe Error:", error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { username, email, new_password, confirm_password } = req.body;
        const user = await User.findByPk(req.session.userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update basic info
        if (username) user.username = username;
        if (email) user.email = email;

        // Update password if provided
        if (new_password) {
            if (new_password !== confirm_password) {
                return res.status(400).json({ error: 'New passwords do not match' });
            }
            user.password = new_password; // Hook will hash it
        }

        await user.save();
        res.json({ success: true, message: 'Profile updated successfully' });

    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};
