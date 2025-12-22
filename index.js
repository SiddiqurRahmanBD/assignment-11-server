const express = require("express");
const cors = require("cors");

require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

const stripe = require("stripe")(process.env.STRIPE_KEY);
const crypto = require("crypto");

app.use(cors());
app.use(express.json());


const admin = require("firebase-admin");


const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);

const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if(!token){
    return res.status(401).send({message: 'unauthorize access'})
  }

  try {
const idToken = token.split(' ')[1]
const decoded = await admin.auth().verifyIdToken(idToken)
console.log("decoded info", decoded);
req.decoded_email = decoded.email;
next();
  }
  catch(error) {
  return res.status(401).send({ message: "unauthorize access" });
  }
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@duasmasi.bhtinpf.mongodb.net/?appName=Duasmasi`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    const db = client.db("savelife");
    const usersCollection = db.collection("users");
    const requestsCollection = db.collection("requests");
    //User info
    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      userInfo.createdAt = new Date();
      userInfo.role = "Donor";
      userInfo.status = "Active";
      const result = await usersCollection.insertOne(userInfo);
      res.send(result);
    });

    app.get("/users", verifyToken, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.status(200).send(result);
    });

    app.get("/user/profile", verifyToken, async (req, res) => {
      const email = req.decoded_email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    
  app.patch("/profile-update/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    const updatedProfile = req.body;

    const query = { email: email };

    const updateData = {
      $set: {
        name: updatedProfile.name,
        district: updatedProfile.district,
        upzila: updatedProfile.upzila,
        bloodGroup: updatedProfile.bloodGroup,
        photoURL: updatedProfile.photoURL,
        photoURL: updatedProfile.photoURL
      },
    };

    const result = await usersCollection.updateOne(query, updateData);

    res.send(result);
  });

    //User role
    app.get("/users/role/:email", async (req, res) => {
      const { email } = req.params;

      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // User Status Update
    app.patch("/update/user/status", verifyToken, async (req, res) => {
      const { email, status } = req.query;
      const query = { email: email };
      const updateStatus = {
        $set: {
          status: status,
        },
      };
      const result = await usersCollection.updateOne(query, updateStatus);
      res.send(result);
    });
 // PUT or PATCH is appropriate here
app.patch("/donations/confirm/:id", verifyToken, async (req, res) => {
  const id = req.params.id; // Get ID from URL
  const { donationStatus } = req.body; // Get data from body
  
  const query = { _id: new ObjectId(id) };
  
  const updateDoc = {
    $set: {
      donationStatus: donationStatus,
      // donorName: donorName,
      // donorEmail: donorEmail,
    },
  };

  try {
    const result = await donationCollection.updateOne(query, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to confirm donation", error });
  }
});
    app.patch("/update/user/role", verifyToken, async (req, res) => {
      const { email, role } = req.query;
      const query = { email: email };
      const updateStatus = {
        $set: {
          role: role,
        },
      };
      const result = await usersCollection.updateOne(query, updateStatus);
      res.send(result);
    });

    // Request Info

    app.post("/requests", verifyToken, async (req, res) => {
      const data = req.body;
      data.createdAt = new Date();
      const result = await requestsCollection.insertOne(data);
      res.send(result);
    });

    app.get("/my-requests", verifyToken, async (req, res) => {
      const email = req.decoded_email;
      const size = Number(req.query.size);
      const page = Number(req.query.page);
      const query = { requesterEmail: email };
      const result = await requestsCollection
        .find(query)
        .limit(size)
        .skip(size * page)
        .toArray();

      const totalRequest = await requestsCollection.countDocuments(query);
      res.send({ request: result, totalRequest });
    });

    app.get("/my-recent-requests", verifyToken, async (req, res) => {
      const email = req.decoded_email;
      const query = { requesterEmail: email };

      const result = await requestsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray();

      res.send(result);
    });

    app.get("/all-requests", verifyToken, async (req, res) => {
      const email = req.decoded_email;
      const size = Number(req.query.size); 
      const page = Number(req.query.page); 
      const status = req.query.status; 
      let query = {};

      const user = await usersCollection.findOne({ email });
      if (user.role === "donor") {
        query.requesterEmail = email;
      }

      if (status) {
        query.donationStatus = status;
      }

      const result = await requestsCollection
        .find(query)
        .limit(size)
        .skip(size * page)
        .sort({ createdAt: -1 })
        .toArray();

      const totalRequest = await requestsCollection.countDocuments(query);

      res.send({ request: result, totalRequest });
    });

    app.get("/all-pending-requests", async (req, res) => {
      const query = {
        donationStatus: "Pending",
      };
      const result = await requestsCollection
        .find(query)
        .sort({ donationDate: 1 })
        .toArray();

      res.send(result);
    });
    app.get("/donation-details/:id", async (req, res) => {
      const { id } = req.params;
      const objectId = new ObjectId(id);
      const result = await requestsCollection.findOne({ _id: objectId });

      res.send(result);
    });

    app.get("/search-requests", async (req, res) => {
    
      const { bloodGroup, district, upzila } = req.query;
      const query = {};

      if (bloodGroup) {
        query.bloodGroup = bloodGroup;
      }

      if (district) {
  
        query.districtName = district;
      }

      if (upzila) {
        query.upzila = upzila;
      }

      const result = await requestsCollection.find(query).toArray();
      res.send(result);
      
    });

    //Payment
    app.post("/create-payment-chechout", async (req, res) => {
      const paymentInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: 'USD',
              product_data:{
                name:paymentInfo.
              }
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.SITE_DOMAIN}?success=true`,
      });

    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get("/", (req, res) => {
  res.send("Last Mission Server is Working!");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});