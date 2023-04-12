//các biến môi trường
const mongodbURL = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@cluster0.btdla2l.mongodb.net/${process.env.MONGO_DEFAULT_DATABASE}?retryWrites=true&w=majority`;
const port = process.env.PORT;

//expressjs là framework cho node, giúp viết code (xây dựng máy chủ) trong nodejs đơn giản hơn
const express = require("express");
//dùng cors để cho phép truy vấn thông tin ở các origin khác nhau không bị chặn bởi same-origin-policy
const cors = require("cors");
//bcrypt để mã hóa string. Dùng khi lưu password người dùng
const bcrypt = require("bcryptjs");
//phiên dịch req.body
const bodyParser = require("body-parser");
//mongoose để tương tác với MongoDB đơn giản hơn
const mongoose = require("mongoose");
//sử dụng session
const session = require("express-session");
//lưu session vào mongoDB thay vì vào máy tính
const MongoDBStore = require("connect-mongodb-session")(session);

const io = require("./socket");

const User = require("./model/user");
const Blog = require("./model/blog");

const app = express();

//thiết lập cors
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["POST", "PUT", "GET", "OPTIONS", "HEAD"],
    credentials: true,
  })
);
app.set("trust proxy", 1);
//nếu không có cái này, req.body = undefined
app.use(express.json());
//handle giữ liệu được gửi đến và lưu vào req.body
app.use(bodyParser.urlencoded({ extended: false }));
// app.use(
//   multer({ storage: fileStorage, fileFilter: fileFilter }).single("image")
// );
//thiết lập store để lưu session
const store = new MongoDBStore({
  uri: mongodbURL,
  collection: "sessions",
});
app.use(
  session({
    secret: "my secret",
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: "lax", secure: false, maxAge: 1000 * 60 * 60 },
    store: store,
  })
);

app.get("/user/check-session", (req, res, next) => {
  if (!req.session.user) {
    console.log("No session");
    return res.sendStatus(401);
  } else {
    const response = {
      fullname: req.session.user.fullname,
      id: req.session.user._id,
    };
    return res.status(200).json(response);
  }
});

app.post("/user/signup", (req, res, next) => {
  const userData = {
    email: req.body.email,
    fullname: req.body.fullname,
    password: bcrypt.hashSync(req.body.password, 12),
  };
  User.findOne({ email: userData.email }).then((data) => {
    if (!data) {
      const user = new User(userData);
      user
        .save()
        .then((user) => {
          return res.sendStatus(200);
        })
        .catch((err) => res.sendStatus(500));
    } else {
      res.statusCode = 402;
      res.statusMessage = "Email already exist";
      return res.end();
    }
  });
});

app.post("/user/signin", (req, res, next) => {
  User.findOne({ email: req.body.email })
    .then((user) => {
      if (!user) {
        res.statusCode = 401;
        res.statusMessage = "Email not exist";
        return res.end();
      }

      if (!bcrypt.compareSync(req.body.password, user.password)) {
        res.statusCode = 402;
        res.statusMessage = "Password not correct";
        return res.end();
      }

      req.session.user = user;
      const response = {
        id: user._id,
        fullname: user.fullname,
      };
      return res.status(200).json(response);
    })
    .catch((err) => console.log(err));
});

app.post(`/user/signout`, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      res.sendStatus(500);
    } else {
      res.sendStatus(200);
    }
  });
});

app.get("/blog", (req, res, next) => {
  Blog.find({}).then((posts) => res.send(posts));
});

app.get("/blog/:blogId", (req, res, next) => {
  Blog.find({ _id: req.params.blogId }).then((post) => res.send(post));
});

app.post("/blog/add-blog", (req, res, next) => {
  const blogInfor = {
    ...req.body,
    author: req.session.user.fullname,
    date: new Date(),
  };
  const blog = new Blog(blogInfor);
  blog.save().then((blog) => {
    io.getIO().emit("blogs", { action: "create", blog: blog });
    return res.sendStatus(200);
  });
});

mongoose
  .connect(mongodbURL)
  .then((result) => {
    const server = app.listen(port || 5000);
    const io = require("./socket").init(server, {
      cors: {
        origin: "http://localhost:3000",
        methods: ["POST", "PUT", "GET", "OPTIONS", "HEAD"],
        credentials: true,
      },
    });
    io.on("connection", (socket) => {
      console.log("Client connected");
    });
  })
  .catch((err) => {
    console.log(err);
  });
