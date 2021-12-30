const express = require('express');
const nodemailer = require('nodemailer');
const { validationResult, check, body } = require('express-validator');
const db = require('./connection/db');
const bcrypt = require('bcrypt');
const session = require('express-session');
const flash = require('express-flash');
const upload = require('./middleware/uploadFile');

const app = express();
const PORT = process.env.PORT || 3000;

// Custome time
function getFullTime(time) {
  // time = new Date(`${time}`);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'Mei',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  let date = time.getDate();
  let month = months[time.getMonth()];
  let year = time.getFullYear();
  let hours = time.getHours();
  let minutes = time.getMinutes();

  return `${date} ${month} ${year} - ${hours}:${minutes} WIB`;
}

// Time stamp upload
function getDisctanceTime(time) {
  let timePosted = time;
  let timeNow = new Date();
  let timeDistance = timeNow - timePosted;

  // get time distance by day
  let distanceDay = Math.floor(timeDistance / (23 * 3600 * 1000));
  if (distanceDay == 1) {
    console.log(distanceDay);
    return `a day ago`;
  }
  if (distanceDay >= 1) {
    return `${distanceDay} days ago`;
  }

  // get time distance by hour
  let distanceHours = Math.floor(timeDistance / (60 * 60 * 1000));
  if (distanceHours == 1) {
    return `an hour ago`;
  }
  if (distanceHours > 1) {
    return `${distanceHours} hours ago`;
  }

  // get time distance by minutes
  let distanceMinutes = Math.floor(timeDistance / (60 * 1000));
  if (distanceMinutes == 1) {
    return `a minute ago`;
  }
  if (distanceMinutes > 1) {
    console.log(distanceMinutes + 'minutes');
    return `${distanceMinutes} minutes ago`;
  }

  // get time distance by second
  let distanceSeconds = Math.floor(timeDistance / 1000);
  if (distanceSeconds <= 1) {
    return `Just Now`;
  }
  if (distanceSeconds > 1) {
    console.log(distanceSeconds + 'seconds');
    return `${distanceSeconds} seconds ago`;
  }
}

// check mail is signed or not
function isMailSigned(email) {
  return new Promise((resolve, reject) => {
    db.connect((_err, client) => {
      client.query(
        'SELECT * FROM tb_user WHERE email = $1',
        [email],
        (err, result) => {
          if (err) {
            reject(err);
          }
          resolve(result);
        }
      );
    });
  });
}

// using view engine handlebars
app.set('view engine', 'hbs');

// middleware
app.use('/public', express.static(__dirname + '/public')); // registered foler public so it can access by browser
app.use('/uploads', express.static(__dirname + '/uploads')); // registered foler uploads so it can access by browser
app.use(express.urlencoded({ extended: false })); // body parser
app.use(
  session({
    cookie: {
      maxAge: 2 * 60 * 60 * 1000, // session duration each user when login
      secure: false,
      httpOnly: true,
    },
    store: new session.MemoryStore(),
    saveUninitialized: true,
    resave: false,
    secret: 'secretValue',
  })
); // session settings
app.use(flash()); // flash messages

// render home page
app.get('/', (req, res) => {
  db.connect((err, client, done) => {
    if (err) throw err;

    client.query('SELECT * FROM experiences', (error, result) => {
      if (error) throw error;

      let experiences = result.rows;
      let { isLogin, user } = req.session;
      experiences = experiences.reverse();
      res.render('index', { experiences, user, isLogin });
    });
  });
});

// render blog page
app.get('/blog', (req, res) => {
  db.connect((err, client, done) => {
    if (err) throw err;
    client.query(
      `SELECT blog.id, blog.title, blog.content, blog.image, tb_user.name AS author, blog.post_date 
       FROM blog LEFT JOIN tb_user
       ON tb_user.id = blog.author_id ORDER BY blog.post_date DESC`,
      (err, result) => {
        let { isLogin, user } = req.session;
        let blogs = result.rows.map((blog) => {
          return {
            ...blog,
            image: '/uploads/' + blog.image,
            isLogin: isLogin,
            post_date: getFullTime(blog.post_date),
            post_age: getDisctanceTime(blog.post_date),
          };
        });
        res.render('blog', { isLogin, blogs, user });
      }
    );
  });
});

// render add blog
app.get('/add-blog', (req, res) => {
  res.render('add-blog', {
    isLogin: req.session.isLogin,
    user: req.session.user,
  }); // render file add-blog
});

// add new blog
app.post(
  '/blog',
  upload.single('image'),
  [
    check('title', 'Title is required').not().isEmpty().trim(),
    check('content', 'Content is required').not().isEmpty().trim(),
  ],
  (req, res) => {
    // check if user already signin
    if (!req.session.user) {
      req.flash('danger', 'Please Login First');
      return res.redirect('/sign-in');
    }

    // validate all form input
    let errorMessages = {
      title: {
        appendClass: 'is-valid',
        feedback: 'valid-feedback',
      },
      content: {
        appendClass: 'is-valid',
        feedback: 'valid-feedback',
      },
      image: {
        appendClass: 'is-invalid',
        feedback: 'invalid-feedback',
        msg: 'Image is reqired',
      },
    };
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errs = errors.array();
      for (const err of errs) {
        errorMessages[`${err.param}`].msg = `${err.msg}`;
        errorMessages[`${err.param}`].appendClass = 'is-invalid';
        errorMessages[`${err.param}`].feedback = 'invalid-feedback';
      }

      return res.render('add-blog', {
        errorMessages,
        imagepath: req.file,
        post: req.body,
        isLogin: req.session.isLogin,
        user: req.session.user,
      });
    }

    if (!req.file) {
      return res.render('add-blog', {
        errorMessages,
        post: req.body,
        isLogin: req.session.isLogin,
        user: req.session.user,
      });
    }

    let author_id = req.session.user.id; // get data user from session storage
    let { title, content } = req.body; // destruct form data
    let image = req.file.filename; // destruct file to get name of file
    const newContent = content.replace(/'/g, (match) => {
      match = "''";
      return match;
    }); // escape single quote before store to database

    // connection to database
    db.connect((err, client, done) => {
      if (err) throw err;
      // query to database
      client.query(
        'INSERT INTO blog (title, content, image, author_id) VALUES ($1, $2, $3, $4)',
        [title, newContent, image, author_id],
        (error, result) => {
          if (error) throw error;
          req.flash('success', `Data ${title} has been successfully added!`);
          res.redirect('/blog');
        }
      );
    });
  }
);

// delete blog
app.get('/delete-blog/:id', (req, res) => {
  db.connect((err, client, done) => {
    if (err) throw err;
    client.query(
      `DELETE FROM blog WHERE id = $1`,
      [req.params.id],
      (error, result) => {
        if (error) throw error;
        res.redirect('/blog');
      }
    );
  });
});

// render edit blog
app.get('/edit-blog/:id', (req, res) => {
  const { isLogin, user } = req.session;
  db.connect((err, client, done) => {
    if (err) throw err;
    client.query(
      'SELECT * FROM blog WHERE id = $1',
      [req.params.id],
      (error, result) => {
        if (error) throw error;
        const [blog] = result.rows;
        res.render('edit-blog', { blog, isLogin, user });
      }
    );
  });
});

// update blog
app.post(
  '/update-post/:id',
  upload.single('image'),
  [
    check('title', 'This field is required').not().isEmpty().trim(),
    check('content', 'This field is required').not().isEmpty().trim(),
  ],
  (req, res) => {
    // check if user already signin
    if (!req.session.user) {
      req.flash('danger', 'Please Login First');
      return res.redirect('/sign-in');
    }

    // check all field
    const errors = validationResult(req);
    let errorMessages = {
      title: {
        appendClass: 'is-valid',
        feedback: 'valid-feedback',
      },
      content: {
        appendClass: 'is-valid',
        feedback: 'valid-feedback',
      },
      image: {
        appendClass: 'is-valid',
        feedback: 'valid-feedback',
      },
    };
    if (!errors.isEmpty()) {
      const errs = errors.array();

      errs.forEach((err) => {
        errorMessages[`${err.param}`].msg = `${err.msg}`;
        errorMessages[`${err.param}`].appendClass = 'is-invalid';
        errorMessages[`${err.param}`].feedback = 'invalid-feedback';
      });
      const blog = {
        title: req.body.title,
        content: req.body.content,
        image: req.body.image,
        id: req.params.id,
      };
      return res.render('edit-blog', { errorMessages, blog });
    }

    if (!req.file) {
      return res.render('edit-blog', {
        errorMessages,
        post: req.body,
        isLogin: req.session.isLogin,
        user: req.session.user,
      });
    }

    let blog_id = req.params.id;
    let { title, content } = req.body; // destruct form data
    let image = req.file.filename; // destruct file to get name of file
    const newContent = content.replace(/'/g, (match) => {
      match = "''";
      return match;
    }); // escape single quote before store to database

    // update data
    db.connect((err, client, done) => {
      if (err) throw err;
      client.query(
        'UPDATE blog SET title = $1, content = $2, image = $3 WHERE id = $4',
        [title, newContent, image, blog_id],
        (error, result) => {
          if (error) throw error;
          req.flash('success', `Data ${title} successfully updated`);
          return res.redirect('/blog');
        }
      );
    });
  }
);

// render contact post
app.get('/contact-me', (req, res) => {
  const { isLogin, user } = req.session;
  res.render('contact', { isLogin, user }); // render file blog
});

// send mail on contact page
app.post(
  '/contact-me',
  [
    check('name', 'Please write your name').not().isEmpty().trim().escape(),
    check('email', 'Email is invalid')
      .isEmail()
      .normalizeEmail()
      .trim()
      .escape(),
    check('phone', 'Phone number is invlaid').isMobilePhone(),
    check('message', 'Please write something for me')
      .not()
      .isEmpty()
      .trim()
      .escape(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    const { isLogin, user } = req.session;

    // validate all form inputs
    if (!errors.isEmpty()) {
      const errs = errors.array();
      let errorMessages = {
        name: {
          validate: false,
          appendClass: 'is-valid',
          feedback: 'valid-feedback',
        },
        email: {
          appendClass: 'is-valid',
          feedback: 'valid-feedback',
        },
        phone: {
          appendClass: 'is-valid',
          feedback: 'valid-feedback',
        },
        subject: {
          appendClass: 'is-valid',
          feedback: 'valid-feedback',
        },
        message: {
          appendClass: 'is-valid',
          feedback: 'valid-feedback',
        },
      };

      errs.forEach((err) => {
        errorMessages[`${err.param}`].msg = `${err.msg}`;
        errorMessages[`${err.param}`].appendClass = 'is-invalid';
        errorMessages[`${err.param}`].feedback = 'invalid-feedback';
        req.body[`${err.param}`] = '';
      });
      return res.render('contact', {
        errorMessages,
        letter: req.body,
        isLogin,
        user,
      });
    }

    // sender configuration
    const transporter = nodemailer.createTransport({
      // using SMTP Etheral to send mail
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: 'jaron.rau88@ethereal.email',
        pass: 'B8AJPWZFEM7pMbDW12',
      },
    });

    // mail options
    const mailOptions = {
      from: req.body.name + '<' + req.body.email + '>',
      to: 'agunfahminurhakiki@gmail.com',
      subject: req.body.subject + '<' + req.body.email + '>',
      text: `${req.body.message}\n\nMy phone: ${req.body.phone}`,
    };

    // send mail
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) throw err;
      res.render('contact', { msg: 'success', isLogin, user });
    });
  }
);

// render detail-blog
app.get('/detail-blog/:id', (req, res) => {
  const { isLogin, user } = req.session;
  db.connect((err, client, done) => {
    if (err) throw err;
    client.query(
      `SELECT * FROM blog WHERE id = ${req.params.id}`,
      (error, result) => {
        if (error) throw error;
        const [blog] = result.rows;
        res.render('detail-blog', {
          ...blog,
          post_date: getFullTime(blog.post_date),
          isLogin,
          user,
        });
      }
    );
  });
});

// render sign in page
app.get('/sign-in', (req, res) => {
  res.render('signin');
});

// checking user credintial
app.post('/sign-in', (req, res) => {
  let { email, password } = req.body;
  db.connect((err, client, done) => {
    if (err) throw err;
    client.query(
      'SELECT * FROM tb_user WHERE email = $1',
      [email],
      (err, result) => {
        if (err) throw err;

        // validate email
        if (result.rows.length == 0) {
          req.flash('danger', "Email and password don't match");
          return res.redirect('/sign-in');
        }

        // validate password
        const isMatch = bcrypt.compareSync(password, result.rows[0].password);
        if (isMatch) {
          req.session.isLogin = true;
          req.session.user = {
            id: result.rows[0].id,
            name: result.rows[0].name,
            email: result.rows[0].email,
          };
          req.flash('success', `Hi! ${req.session.user.name}`);
          return res.redirect('/blog');
        }

        req.flash('danger', "Email and password don't match");
        return res.redirect('/sign-in');
      }
    );
  });
});

// render sign up page
app.get('/sign-up', (req, res) => {
  res.render('signup');
});

// create new user
app.post(
  '/sign-up',
  [
    check('email', 'Email is invalid')
      .isEmail()
      .normalizeEmail()
      .custom((value) => {
        return new Promise((resolve, reject) => {
          isMailSigned(value)
            .then((dbres) => {
              if (dbres.rows.find((x) => x.email === value))
                reject(`Email laready in use`);
              else resolve();
            })
            .catch((err) => {
              reject('Database error: ', err.message);
            });
        });
      }),
    check('name', 'This field is required').not().isEmpty().trim(),
    check('password', 'This field is required').not().isEmpty(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errs = errors.array();
      let errorMessages = {
        name: {
          appendClass: 'is-valid',
          feedback: 'valid-feedback',
        },
        password: {
          appendClass: 'is-valid',
          feedback: 'valid-feedback',
        },
        email: {
          appendClass: 'is-valid',
          feedback: 'valid-feedback',
        },
      };

      for (const e of errs) {
        errorMessages[`${e.param}`].msg = `${e.msg}`;
        errorMessages[`${e.param}`].appendClass = 'is-invalid';
        errorMessages[`${e.param}`].feedback = 'invalid-feedback';
      }

      return res.render('signup', { errorMessages, data: req.body });
    }

    let { name, email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.connect((err, client, done) => {
      if (err) throw err;
      client.query(
        'INSERT INTO tb_user(name, email, password) values($1, $2, $3)',
        [name, email, hashedPassword],
        (error, result) => {
          if (error) throw error;
          req.flash(
            'success',
            'Signup success!, now you can sign in with your account'
          );
          res.redirect('/sign-in');
        }
      );
    });
  }
);

// logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// lost page
app.use((req, res) => {
  res.status(404);
  res.render('404');
});

app.listen(PORT, () => {
  console.log(`Server starting on http://localhost:${PORT}`);
});
