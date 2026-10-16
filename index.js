import express from "express"
import db from "./db.js";
import bcrypt from "bcrypt";
import session from "express-session";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(session ({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60
    }
}));
app.use(express.static("public"));
const port = 3000;
const posts = [
    {
        id: 1,
        title: "My First Post",
        content: "This is my very first blog post!"
    }
];

app.get("/", async (req, res) => {
    try {
    const result = await db.query(
        "SELECT * FROM blogs ORDER BY date_created DESC"
    );

    console.log("Posts returned by database:", result.rows.length);
    const userResult = req.session.userId
        ? await db.query(
            "SELECT name FROM users WHERE user_id = $1",
            [req.session.userId]
        )
        : {rows: [] };
    res.render("index.ejs", {
        blogTitle: "My Writing Corner",
        posts: result.rows,
        userId: req.session.userId,
        userName: userResult.rows[0]?.name 
    });
    } catch (err) {
        console.error("Loading posts error:", err.message);
        res.status(500).send("Unable to load blog posts.");
    }
});

app.post("/posts", async (req, res) => {
    const { title, content } = req.body;

    console.log("Create Post session user ID:", req.session.userId);

    try {
        const result = await db.query(
            "SELECT name FROM users WHERE user_id = $1",
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).send("Please sign in first.");
        }
        const creatorName = result.rows[0].name;

        await db.query(
            "INSERT INTO blogs (title, body, creator_name, creator_user_id, date_created) VALUES ($1, $2, $3, $4, NOW())",
            [title, content, creatorName, req.session.userId]
        );

        res.redirect("/");
    } catch (err) {
        console.error("Post creation error:", err.message);
        res.status(500).send("Unable to create blog post.");
    }
});

app.get("/posts/:id/edit", async (req, res) => {
    try {
        const result = await db.query(
            "SELECT * FROM blogs WHERE blog_id = $1",
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).send("Blog post not found.");
        }

        res.render("edit.ejs", { post: result.rows[0] });
    } catch (err) {
        console.error("Loading edit page error:", err.message);
        res.status(500).send("Unable to load edit page.");
    }
});

app.post("/posts/:id/edit", async (req,res) => {
    if (!req.session.userId) {
        return res.status(401).send("Please sign in first.");
    }

    const {title, content} = req.body;

    try {
        const result = await db.query(
            "UPDATE blogs SET title = $1, body = $2 WHERE blog_id = $3 AND creator_user_id = $4",
            [title, content, req.params.id, req.session.userId]
        );

        if(result.rowCount === 0) {
            return res.status(403).send("You cannot edit this post.");
        }

        res.redirect("/");
    } catch (err) {
        console.error("Updating post error:", err.message);
        res.status(500).send("Unable to update blog post.");
    }
});

app.post("/posts/:id/delete", async (req, res) => {
    if(!req.session.userId) {
        return res.status(401).send("Please sign in first.");
    }

    console.log("Delete route reached for post:", req.params.id);
    try {
        const result = await db.query(
            "DELETE FROM blogs WHERE blog_id = $1 AND creator_user_id = $2",
            [req.params.id, req.session.userId]
        );

        if (result.rowCount === 0) {
            return res.status(403).send("You cannot delete this post.");
        }

        res.redirect("/");
    } catch (err) {
        console.error("Deleting post error:", err.message);
        res.status(500).send("Unable to delete blog post.");
    }
});

app.get("/signup", (req, res) => {
    res.render("signup.ejs");
});

app.post("/signup", async (req, res) => {
    const { user_id, password, name } = req.body;

    try {
        const existingUser = await db.query(
            "SELECT * FROM users WHERE user_id = $1",
            [user_id]
        );
        if (existingUser.rows.length > 0) {
            return res.status(400).send(
                "That User ID is already taken. Please choose another."
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            "INSERT INTO users (user_id, password, name) VALUES ($1, $2, $3)",
            [user_id, hashedPassword, name]
        );

        res.redirect("/signin");
    } catch (err) {
        console.error("Signup error:", err.message);
        res.status(500).send("Unable to create account.");
    }
});

app.get("/signin", (req, res) => {
    res.render("signin.ejs");
});

app.post("/signin", async (req, res) => {
    const { user_id, password } = req.body;

    try {
        const result = await db.query(
            "SELECT * FROM users WHERE user_id = $1",
            [user_id]
        );

        if (result.rows.length === 0) {
            return res.status(401).send("User ID or password is incorrect.");
        }

        const user = result.rows[0];

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatches) {
            return res.status(401).send("User ID or password is incorrect.");
        }

        req.session.userId = user.user_id;

        console.log("Signed-in user ID:", req.session.userId);

        res.redirect("/");
    } catch (err) {
        console.error("Signin error:", err.message);
        res.status(500).send("Unable to sign in.");
    }
});

app.post("/signout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send("Unable to sign out.");
        }

        res.redirect("/signin");
    })
})

app.listen(port, () => {
    console.log(`Server running on port ${port}.`);
});