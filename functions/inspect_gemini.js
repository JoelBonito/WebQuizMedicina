
const { GoogleGenerativeAI } = require("@google/generative-ai");
console.log("GoogleGenerativeAI prototype:", Object.getOwnPropertyNames(GoogleGenerativeAI.prototype));
const genAI = new GoogleGenerativeAI("test");
console.log("genAI instance keys:", Object.keys(genAI));
console.log("genAI instance proto:", Object.getOwnPropertyNames(Object.getPrototypeOf(genAI)));

try {
    const fs = require('fs');
    const path = require('path');
    const packageJson = require('./package.json');
    console.log("Package version:", packageJson.dependencies['@google/generative-ai']);
} catch (e) {
    console.log("Could not read package.json");
}
