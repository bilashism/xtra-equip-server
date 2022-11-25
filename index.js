const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;
const app = express();

// middleware
app.use(cors());
app.use(express.json());

/**
 * It checks if the request has an authorization header, if it doesn't, it returns a 401 status code,
 * if it does, it splits the token and verifies it using the jwt.verify() method. If the token is
 * invalid, it returns a 403 status code, if it's valid, it decodes the token and passes it to the next
 * middleware
 * @param req - The request object
 * @param res - The response object.
 * @param next - This is a callback function that is called when the middleware is complete.
 * @returns The token is being returned.
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ").pop();
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

// localhost server setup
const server = app.listen(port, "localhost", () => {
  const host = server.address().address;
  const port = server.address().port;

  console.log(`🌐 Running at: http://${host}:${port}`);
});

// server root
app.get("/", (req, res) => {
  res.sendStatus(200);
});

// integrate mongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PWD}@${process.env.DB_CLUSTER_URL}/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1
});

const run = async () => {
  const database = client.db("xtraEquip");
  const categoriesCollection = database.collection("categories");
  const usersCollection = database.collection("users");
  const productsCollection = database.collection("products");

  // get [limit] from all categories
  app.get("/categories", async (req, res) => {
    const limit = parseInt(req.query.limit);
    const query = {};
    const result = await categoriesCollection
      .find(query)
      .limit(limit)
      .toArray();
    res.send(result);
  });

  // get all product from a category
  app.get("/categories/:id", async (req, res) => {
    const categoryId = req.params.id;
    const categoryName = await categoriesCollection.find();
    res.send([]);
  });

  // check admin status
  app.get("/users/admin/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const result = await usersCollection.findOne(query);
    res.send({ isAdmin: result?.userRole === "admin" });
  });

  // create an user
  app.post("/users", async (req, res) => {
    const user = req.body;
    if (!user?.userRole) {
      user.userRole = "buyer";
    }
    const isExisting = await usersCollection.findOne({ email: user?.email });

    if (isExisting) {
      return res.status(200).send({ message: "User already exists!" });
    }

    const result = await usersCollection.insertOne(user);
    res.send(result);
  });

  // issue jwt token
  app.get("/jwt", async (req, res) => {
    const email = req?.query?.email;
    const user = await usersCollection.findOne({ email });

    if (user) {
      const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
        expiresIn: "10h"
      });
      return res.send({ accessToken: token });
    }
    res.status(401).send({ message: "Unauthorized access" });
  });
};
run().catch(console.dir);
