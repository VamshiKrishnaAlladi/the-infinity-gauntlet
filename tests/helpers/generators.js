const fc = require( 'fast-check' );

function stringOf( charArbitrary, constraints ) {
    return fc.array( charArbitrary, constraints ).map( chars => chars.join( '' ) );
}

const URL_CHARS = [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
];

const validUrlPatternArbitrary = stringOf(
    fc.constantFrom( ...URL_CHARS, '.', '-', '/', ':' ),
    { minLength: 1, maxLength: 100 }
).filter( s => s.trim().length > 0 );

const protocolArbitrary = fc.constantFrom( 'https://', 'http://' );
const domainPrefixArbitrary = fc.constantFrom( 'www.', 'api.', 'cdn.', '' );
const domainPrefixSimpleArbitrary = fc.constantFrom( 'www.', '' );
const domainNameArbitrary = stringOf(
    fc.constantFrom( ...URL_CHARS, '-' ),
    { minLength: 1, maxLength: 20 }
).filter( s => s.trim().length > 0 && !s.startsWith( '-' ) && !s.endsWith( '-' ) );
const tldArbitrary = fc.constantFrom( '.com', '.org', '.net', '.io', '.co', '.edu', '.gov' );
const urlPathArbitrary = stringOf(
    fc.constantFrom( ...URL_CHARS, '/', '-', '_' ),
    { minLength: 0, maxLength: 30 }
);

const queryParamArbitrary = stringOf(
    fc.constantFrom( ...URL_CHARS, '=', '&' ),
    { minLength: 0, maxLength: 20 }
);

function uniqueBlockedListArbitrary( opts = {} ) {
    return fc.uniqueArray( validUrlPatternArbitrary, {
        minLength: opts.minLength ?? 0,
        maxLength: opts.maxLength ?? 50
    } );
}

const whitespaceOnlyArbitrary = stringOf(
    fc.constantFrom( ' ', '\t', '\n', '\r', '\f', '\v' ),
    { minLength: 0, maxLength: 100 }
);

module.exports = {
    fc,
    stringOf,
    validUrlPatternArbitrary,
    protocolArbitrary,
    domainPrefixArbitrary,
    domainPrefixSimpleArbitrary,
    domainNameArbitrary,
    tldArbitrary,
    urlPathArbitrary,
    queryParamArbitrary,
    uniqueBlockedListArbitrary,
    whitespaceOnlyArbitrary,
    URL_CHARS
};
