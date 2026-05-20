/** @type {import("jest").Config} **/
export default {
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "./tsconfig.jest.json"
      }
    ]
  },
  transformIgnorePatterns: [
    "/node_modules/"
  ]
};