"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const mongodb_1 = require("mongodb");
const dotenv_1 = __importDefault(require("dotenv"));
// .env ফাইল লোড করা
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 6060;
// 🛠️ access all domain;
app.use((0, cors_1.default)());
app.use(express_1.default.json()); // for recive json data;
const uri = process.env.MONGODB_URI;
// MongoClient তৈরি করা (TypeScript এ ServerApiVersion এবং অন্যান্য অপশন অটো-ডিটেক্ট হয়)
const client = new mongodb_1.MongoClient(uri, {
    serverApi: {
        version: mongodb_1.ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {
    try {
        // MongoDB সার্ভারের সাথে কানেক্ট করা
        // await client.connect();
        // console.log("📌 Successfully connected to MongoDB!");
        const db = client.db(process.env.DB_NAME);
        const recipeCollection = db.collection("recipes");
        const sessionCollection = db.collection("session");
        const userCollection = db.collection("user");
        // middle ware >---- verify token;
        const verifyToken = async (req, res, next) => {
            const authHeader = req.headers?.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: "Unauthorized access" });
            }
            const token = authHeader.split(" ")[1];
            if (!token) {
                return res.status(401).send({ message: "Unauthorized access" });
            }
            const query = { token: token };
            const session = await sessionCollection.findOne(query);
            if (!session) {
                return res.status(401).send({ message: "Unauthorized access" });
            }
            const userId = session?.userId;
            const user = await userCollection.findOne({
                _id: userId
            });
            if (!user) {
                return res.status(401).send({ message: "Unauthorized access" });
            }
            req.user = user;
            next();
        };
        const verifyUser = async (req, res, next) => {
            if (req.user?.userRole !== 'user') {
                return res.status(403).send({ message: 'Forbidden' });
            }
            next();
        };
        // user dashboard stats;
        app.get('/api/user/dashboard-stats', verifyToken, verifyUser, async (req, res) => {
            try {
                const userId = req.user?._id.toString();
                const query = { creatorId: userId };
                // 🕐 টাইমস্ট্যাম্প সেটআপ
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
                sevenDaysAgo.setHours(0, 0, 0, 0);
                // 🚀 Parallel execution using Promise.all
                const [totalRecipes, todayCreated, cuisineAggregation, recentRecipes, chartRawData] = await Promise.all([
                    recipeCollection.countDocuments(query),
                    recipeCollection.countDocuments({
                        creatorId: userId,
                        createdAt: { $gte: todayStart }
                    }),
                    recipeCollection.aggregate([
                        { $match: { creatorId: userId } },
                        { $group: { _id: "$cuisine" } },
                        { $count: "uniqueCuisines" }
                    ]).toArray(),
                    recipeCollection.find(query)
                        .sort({ createdAt: -1 })
                        .limit(4)
                        .toArray(),
                    recipeCollection.aggregate([
                        {
                            $match: {
                                creatorId: userId,
                                createdAt: { $gte: sevenDaysAgo }
                            }
                        },
                        {
                            $group: {
                                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { _id: 1 } }
                    ]).toArray()
                ]);
                const totalCuisine = cuisineAggregation[0]?.uniqueCuisines || 0;
                // 📊 চার্ট ডাটা ফরম্যাটিং (Sun, Mon...)
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const chartData = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const dateString = d.toISOString().split('T')[0];
                    const dayName = dayNames[d.getDay()];
                    const found = chartRawData.find(item => item._id === dateString);
                    chartData.push({
                        day: dayName,
                        count: found ? found.count : 0
                    });
                }
                // 📦 শুধু স্ট্যাটস ডাটা পাঠানো হচ্ছে
                res.status(200).send({
                    totalRecipes,
                    todayCreated,
                    totalCuisine,
                    recentRecipes,
                    chartData
                });
            }
            catch (error) {
                console.error('Dashboard Stats Error:', error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });
        // user add recipe;
        app.post('/api/add-recipe', verifyToken, verifyUser, async (req, res) => {
            try {
                const recipeData = req.body;
                const newData = {
                    ...recipeData,
                    createdAt: new Date()
                };
                await recipeCollection.insertOne(newData);
                res.status(201).json({
                    success: true,
                    message: "Recipe added to database successfully!",
                });
            }
            catch (error) {
                console.error("Database Insert Error:", error);
                res.status(500).json({ success: false, message: "Failed to save recipe." });
            }
        });
        // user, get my-recipes by user id;
        app.get('/api/my-recipe/:creatorId', verifyToken, verifyUser, async (req, res) => {
            const { creatorId } = req.params;
            const result = await recipeCollection
                .find({ creatorId })
                .sort({ createdAt: -1 })
                .toArray();
            res.send(result);
        });
        // user delete recipe;
        app.delete('/api/delete-recipe/:recipeId', verifyToken, verifyUser, async (req, res) => {
            const { recipeId } = req.params;
            const query = {
                _id: new mongodb_1.ObjectId(recipeId)
            };
            await recipeCollection.deleteOne(query);
            res.send({ success: true, message: 'recipe delete successful!' });
        });
        // latest recipe, not secured;
        app.get('/api/latest-recipes', async (req, res) => {
            const result = await recipeCollection.find().sort({ createdAt: -1 }).limit(4).toArray();
            res.send(result);
        });
        // top contributors not secured;
        app.get('/api/recipes/top-contributors', async (req, res) => {
            const pipeline = [
                {
                    $group: {
                        _id: "$creatorId",
                        creatorName: { $first: "$creatorName" },
                        creatorEmail: { $first: "$creatorEmail" },
                        creatorImage: { $first: "$creatorImage" },
                        contribute: { $sum: 1 }
                    },
                },
                { $sort: { contribute: -1 } },
                {
                    $project: {
                        creatorId: "$_id",
                        creatorName: 1,
                        creatorEmail: 1,
                        creatorImage: 1,
                        contribute: 1,
                        _id: 0
                    }
                },
                { $limit: 4 }
            ];
            const result = await recipeCollection.aggregate(pipeline).toArray();
            res.send(result);
        });
        // public, not secured , all recipes with pagination and searching and filtering;
        app.get('/api/public/recipes', async (req, res) => {
            const { search, cuisine, difficult, sortBy } = req.query;
            const query = {};
            if (search?.trim()) {
                query.$or = [
                    { title: { $regex: search, $options: "i" } },
                    { shortDesc: { $regex: search, $options: "i" } },
                ];
            }
            ;
            if (cuisine)
                query.cuisine = cuisine;
            if (difficult)
                query.difficulty = difficult;
            let sortQuery = {};
            if (sortBy === 'newest') {
                sortQuery = { createdAt: -1 };
            }
            if (sortBy === 'oldest') {
                sortQuery = { createdAt: 1 };
            }
            const page = Number(req.query.page || 1);
            const perPage = 12;
            const skipItems = (page - 1) * perPage;
            try {
                const totalRecipe = await recipeCollection.countDocuments(query);
                const recipes = await recipeCollection.find(query)
                    .sort(sortQuery)
                    .skip(skipItems)
                    .limit(perPage)
                    .toArray();
                res.status(200).send({ recipes, totalRecipe });
            }
            catch (error) {
                res.status(500).json({ success: false, message: "Failed to fetch recipes." });
            }
        });
        // get recipe by id not secured;
        app.get('/api/recipes/:id', async (req, res) => {
            const { id } = req.params;
            const result = await recipeCollection.findOne({ _id: new mongodb_1.ObjectId(id) });
            res.send(result || {});
        });
    }
    catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}
// ডাটাবেজ ফাংশনটি রান করানো
run().catch(console.dir);
// 🔍 গ্লোবাল এরর হ্যান্ডলার
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ success: false, message: "Something broke on the server!" });
});
// সার্ভার লিসেন করা
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
exports.default = app;
