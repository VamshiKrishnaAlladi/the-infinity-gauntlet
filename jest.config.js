module.exports = {
    testEnvironment: 'jsdom',
    roots: [ '<rootDir>/tests', '<rootDir>/src' ],
    testMatch: [
        '**/*.test.js',
        '**/*.property.test.js'
    ],
    collectCoverageFrom: [
        'src/**/*.js'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [ 'text', 'lcov', 'html' ],
    setupFilesAfterEnv: [ '<rootDir>/tests/setup.js' ],
    moduleFileExtensions: [ 'js', 'json' ],
    verbose: true
};
