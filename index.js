const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const bdDistrictNames = require("./data/bd/districtNames.json");

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

app.get("/bd/districtNames", (req, res) => {
  res.send(bdDistrictNames);
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

  const verifyAdmin = async (req, res, next) => {
    const decodedEmail = req.decoded.email;
    const query = { email: decodedEmail };
    const user = await usersCollection.findOne(query);
    if (user?.userRole !== "admin") {
      return res.status(403).send({ message: "Forbidden access" });
    }
    next();
  };

  const verifySeller = async (req, res, next) => {
    const decodedEmail = req.decoded.email;
    const query = { email: decodedEmail };
    const user = await usersCollection.findOne(query);
    if (user?.userRole !== "seller") {
      return res.status(403).send({ message: "Forbidden access" });
    }
    next();
  };

  // add a product
  app.post("/products", verifyToken, verifySeller, async (req, res) => {
    const product = req.body;
    const result = await productsCollection.insertOne(product);
    res.send(result);
  });

  // get all products
  app.get("/products", verifyToken, verifySeller, async (req, res) => {
    const sellerEmail = req?.query?.email;
    const query = { sellerEmail };
    const result = await productsCollection.find(query).toArray();
    res.send(result);
  });

  // get all reported products
  app.get("/products/reported", verifyToken, verifyAdmin, async (req, res) => {
    // const sellerEmail = req?.query?.email;
    const query = { isReported: true };
    const result = await productsCollection.find(query).toArray();
    res.send(result);
  });

  // delete a reported product
  app.delete(
    "/products/reported/:id",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
      const productId = req?.params?.id;
      const query = { _id: ObjectId(productId) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    }
  );

  // delete a product
  app.delete("/products/:id", verifyToken, verifySeller, async (req, res) => {
    const sellerEmail = req?.query?.email;
    const productId = req?.params?.id;
    const query = { sellerEmail, _id: ObjectId(productId) };
    const result = await productsCollection.deleteOne(query);
    res.send(result);
  });

  // update a product
  app.put("/products/:id", verifyToken, async (req, res) => {
    const productId = req?.params?.id;
    const query = { _id: ObjectId(productId) };
    const options = { upsert: true };
    const update = req?.body;
    const updatedDoc = {
      $set: update
    };
    const result = await productsCollection.updateOne(
      query,
      updatedDoc,
      options
    );
    res.send(result);
  });

  // advertise a product
  app.put(
    "/products/advertisement/:id",
    verifyToken,
    verifySeller,
    async (req, res) => {
      const sellerEmail = req?.query?.email;
      const productId = req?.params?.id;
      const query = { sellerEmail, _id: ObjectId(productId) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: { isAdvertised: true }
      };
      const result = await productsCollection.updateOne(
        query,
        updatedDoc,
        options
      );
      res.send(result);
    }
  );

  // get all advertised products
  app.get("/products/advertisement", async (req, res) => {
    const query = { isAdvertised: true };
    const result = await productsCollection.find(query).toArray();
    res.send(result);
  });

  // get [limit] from all categories
  app.get("/categories", async (req, res) => {
    const limit = parseInt(req.query?.limit);
    const query = {};
    let result;

    if (limit) {
      result = await categoriesCollection.find(query).limit(limit).toArray();
    } else {
      result = await categoriesCollection.find(query).toArray();
    }

    res.send(result);
  });

  // get all available products from a category
  app.get("/categories/:id", verifyToken, async (req, res) => {
    const categoryId = req.params.id;
    const query = { category: { $regex: categoryId }, isSold: false };
    const result = await productsCollection.find(query).toArray();
    res.send(result);
  });

  // check admin status
  app.get("/users/admin/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const result = await usersCollection.findOne(query);
    res.send({ isAdmin: result?.userRole === "admin" });
  });

  // get all buyers
  app.get("/users/buyer", verifyToken, async (req, res) => {
    const query = { userRole: "buyer" };
    const result = await usersCollection.find(query).toArray();
    res.send(result);
  });

  // check buyer status
  app.get("/users/buyer/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const result = await usersCollection.findOne(query);
    res.send({ isBuyer: result?.userRole === "buyer" });
  });

  // check seller status
  app.get("/users/seller/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const result = await usersCollection.findOne(query);
    res.send({ isSeller: result?.userRole === "seller" });
  });

  // get all sellers
  app.get("/users/seller", verifyToken, async (req, res) => {
    const query = { userRole: "seller" };
    const result = await usersCollection.find(query).toArray();
    res.send(result);
  });

  // verify a seller
  app.put("/users/seller/:id", verifyToken, verifyAdmin, async (req, res) => {
    const userId = req.params?.id;
    const userEmail = req.query?.email;
    const query = { _id: ObjectId(userId) };
    const options = { upsert: true };
    const update = req.body;
    const updatedDoc = {
      $set: update
    };
    const result = await usersCollection.updateOne(query, updatedDoc, options);

    const productsFilter = { sellerEmail: userEmail };
    await productsCollection.updateMany(productsFilter, updatedDoc, options);

    res.send(result);
  });

  // delete an user
  app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
    const userId = req.params.id;
    const query = { _id: ObjectId(userId) };
    const result = await usersCollection.deleteOne(query);
    res.send(result);
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
