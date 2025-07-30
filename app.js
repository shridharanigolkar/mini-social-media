
const express = require("express");
const path = require("path");
const app = express();
const mongoose = require("mongoose");
const userModel = require("./models/user");
const postModel = require("./models/post");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const upload = require("./config/multerconfig");

mongoose.connect("mongodb://127.0.0.1:27017/mini");

app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());


app.get("/", (req, res) => res.redirect("/login"));

app.get("/profile", isLoggedIn, async (req, res) => {
    const user = await userModel.findOne({ email: req.user.email }).populate("posts");
    res.render("profile", { user });
});

app.get("/like/:id", isLoggedIn, async (req, res) => {
  let post = await postModel.findById(req.params.id);
  
  if (!post) return res.status(404).send("Post not found");

  const index = post.likes.indexOf(req.user.userid);

  if (index === -1) {
    post.likes.push(req.user.userid);
  } else {
    post.likes.splice(index, 1);
  }

  await post.save();

  // Redirect back to where the request came from
  const redirectTo = req.query.redirect || "/profile";
  res.redirect(redirectTo);
});

app.get("/edit/:id", isLoggedIn, async (req, res) => {
    const post = await postModel.findById(req.params.id);
    res.render("edit", { post });
});

app.post("/update/:id", isLoggedIn, async (req, res) => {
    await postModel.findByIdAndUpdate(req.params.id, { content: req.body.content });
    res.redirect("/profile");
});

app.post("/post", isLoggedIn, async (req, res) => {
    const user = await userModel.findOne({ email: req.user.email });
    const post = await postModel.create({ user: user._id, content: req.body.content });

    user.posts.push(post._id);
    await user.save();
    res.redirect("/profile");
});

app.get("/register", (req, res) => res.render("index"));


app.post("/register", async (req, res) => {
  let { email, password, username, name, age } = req.body;
  let user = await userModel.findOne({ email });
  if (user) return res.status(500).send("User already registered");

  bcrypt.genSalt(10, function (err, salt) {
    bcrypt.hash(password, salt, async function (err, hash) {
      await userModel.create({
        email,
        password: hash,
        username,
        name,
        age,
      });
      res.redirect("/login"); // <-- Send them to login page
    });
  });
});

app.get("/login", (req, res) => res.render("login"));

app.post("/login", async (req, res) => {
  let { email, password } = req.body;
  let user = await userModel.findOne({ email });
  if (!user) return res.status(404).send("User not found");

  bcrypt.compare(password, user.password, function (err, result) {
    if (result) {
      let token = jwt.sign({ email: email, userid: user._id }, "secret");
      res.cookie("token", token);
      res.redirect("/feed");  // ✅ redirect to global feed after login
    } else {
      res.redirect("/login");
    }
  });
});


app.get("/logout", (req, res) => {
    res.clearCookie("token");
    res.redirect("/login");
});

app.get("/profile/upload", isLoggedIn, (req, res) => res.render("profileupload"));

app.post("/upload", isLoggedIn, upload.single("image"), async (req, res) => {
    const user = await userModel.findOne({ email: req.user.email });
    user.profilepic = req.file.filename;
    await user.save();
    res.redirect("/profile");
});

app.get("/feed", isLoggedIn, async (req, res) => {
  try {
    const posts = await postModel.find({})
      .populate("user")
      .sort({ createdAt: -1 });

    const currentUser = await userModel.findById(req.user.userid);

    res.render("feed", {
      posts: posts,
      currentUserId: currentUser._id, 
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong while loading the feed.");
  }
});


function isLoggedIn(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.redirect("/login");

    try {
        const data = jwt.verify(token, "secret");
        req.user = data;
        next();
    } catch {
        res.clearCookie("token");
        res.redirect("/login");
    }
}

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
