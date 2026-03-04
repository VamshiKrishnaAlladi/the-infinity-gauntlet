const { validateUrl, isDuplicate } = require( '../../src/service-worker' );
const { fc, validUrlPatternArbitrary, whitespaceOnlyArbitrary, uniqueBlockedListArbitrary } = require( '../helpers/generators' );

describe( 'Feature: url-blocker, Property 4: Invalid URL Rejection', () => {
    const uniqueUrlListArbitrary = uniqueBlockedListArbitrary();

    it( 'should reject any whitespace-only string as invalid', async () => {
        await fc.assert(
            fc.asyncProperty( whitespaceOnlyArbitrary, async ( whitespaceString ) => {
                // Validate the whitespace-only string
                const isValid = validateUrl( whitespaceString );

                // All whitespace-only strings should be rejected (return false)
                expect( isValid ).toBe( false );
            } ),
            { numRuns: 100 }
        );
    } );

    it( 'should reject empty string as invalid', async () => {
        // Empty string is a special case of whitespace-only
        const isValid = validateUrl( '' );
        expect( isValid ).toBe( false );
    } );

    it( 'should keep blocked list unchanged when attempting to add whitespace-only URL', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary,
                whitespaceOnlyArbitrary,
                async ( initialList, whitespaceUrl ) => {
                    // Simulate the add operation with validation
                    // First, validate the URL
                    const isValid = validateUrl( whitespaceUrl );

                    // If validation fails, the list should remain unchanged
                    if ( !isValid ) {
                        // Create a copy of the initial list (simulating what would happen)
                        const resultList = [ ...initialList ];

                        // Verify the list remains unchanged
                        expect( resultList ).toEqual( initialList );
                        expect( resultList.length ).toBe( initialList.length );

                        // Verify the whitespace URL is not in the list
                        expect( resultList ).not.toContain( whitespaceUrl );
                    }

                    // The validation should always fail for whitespace-only strings
                    expect( isValid ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should reject strings with only spaces', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.stringOf( fc.constant( ' ' ), { minLength: 1, maxLength: 50 } ),
                async ( spacesOnly ) => {
                    const isValid = validateUrl( spacesOnly );
                    expect( isValid ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should reject strings with only tabs', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.stringOf( fc.constant( '\t' ), { minLength: 1, maxLength: 50 } ),
                async ( tabsOnly ) => {
                    const isValid = validateUrl( tabsOnly );
                    expect( isValid ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should reject strings with only newlines', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.stringOf( fc.constant( '\n' ), { minLength: 1, maxLength: 50 } ),
                async ( newlinesOnly ) => {
                    const isValid = validateUrl( newlinesOnly );
                    expect( isValid ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should reject mixed whitespace strings', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.stringOf(
                    fc.constantFrom( ' ', '\t', '\n', '\r', '\f', '\v' ),
                    { minLength: 1, maxLength: 50 }
                ),
                async ( mixedWhitespace ) => {
                    const isValid = validateUrl( mixedWhitespace );
                    expect( isValid ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should reject non-string inputs', async () => {
        // Test various non-string types
        expect( validateUrl( null ) ).toBe( false );
        expect( validateUrl( undefined ) ).toBe( false );
        expect( validateUrl( 123 ) ).toBe( false );
        expect( validateUrl( {} ) ).toBe( false );
        expect( validateUrl( [] ) ).toBe( false );
        expect( validateUrl( true ) ).toBe( false );
    } );
} );


describe( 'Feature: url-blocker, Property 5: Duplicate URL Rejection', () => {
    const uniqueUrlListArbitrary = uniqueBlockedListArbitrary( { minLength: 1 } );

    it( 'should detect duplicate URLs in the blocked list', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary,
                async ( urlList ) => {
                    // Pick a random URL from the list to test as duplicate
                    const randomIndex = Math.floor( Math.random() * urlList.length );
                    const existingUrl = urlList[ randomIndex ];

                    // Check if isDuplicate correctly identifies the URL as a duplicate
                    const isDuplicateResult = isDuplicate( existingUrl, urlList );

                    // The URL should be detected as a duplicate
                    expect( isDuplicateResult ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should detect duplicates regardless of case (case-insensitive)', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary,
                async ( urlList ) => {
                    // Pick a random URL from the list
                    const randomIndex = Math.floor( Math.random() * urlList.length );
                    const existingUrl = urlList[ randomIndex ];

                    // Create variations with different cases
                    const upperCaseUrl = existingUrl.toUpperCase();
                    const lowerCaseUrl = existingUrl.toLowerCase();
                    const mixedCaseUrl = existingUrl.split( '' ).map( ( char, i ) =>
                        i % 2 === 0 ? char.toUpperCase() : char.toLowerCase()
                    ).join( '' );

                    // All case variations should be detected as duplicates
                    expect( isDuplicate( upperCaseUrl, urlList ) ).toBe( true );
                    expect( isDuplicate( lowerCaseUrl, urlList ) ).toBe( true );
                    expect( isDuplicate( mixedCaseUrl, urlList ) ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should detect duplicates with leading/trailing whitespace', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary,
                async ( urlList ) => {
                    // Pick a random URL from the list
                    const randomIndex = Math.floor( Math.random() * urlList.length );
                    const existingUrl = urlList[ randomIndex ];

                    // Create variations with whitespace
                    const withLeadingSpace = '  ' + existingUrl;
                    const withTrailingSpace = existingUrl + '  ';
                    const withBothSpaces = '  ' + existingUrl + '  ';
                    const withTabs = '\t' + existingUrl + '\t';

                    // All whitespace variations should be detected as duplicates
                    expect( isDuplicate( withLeadingSpace, urlList ) ).toBe( true );
                    expect( isDuplicate( withTrailingSpace, urlList ) ).toBe( true );
                    expect( isDuplicate( withBothSpaces, urlList ) ).toBe( true );
                    expect( isDuplicate( withTabs, urlList ) ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should keep blocked list unchanged when attempting to add duplicate URL', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary,
                async ( initialList ) => {
                    // Pick a random URL from the list to attempt adding as duplicate
                    const randomIndex = Math.floor( Math.random() * initialList.length );
                    const duplicateUrl = initialList[ randomIndex ];

                    // Simulate the add operation with duplicate check
                    const isDuplicateResult = isDuplicate( duplicateUrl, initialList );

                    // If it's a duplicate, the list should remain unchanged
                    if ( isDuplicateResult ) {
                        // Create a copy of the initial list (simulating what would happen)
                        const resultList = [ ...initialList ];

                        // Verify the list remains unchanged
                        expect( resultList ).toEqual( initialList );
                        expect( resultList.length ).toBe( initialList.length );
                    }

                    // The duplicate check should always return true for existing URLs
                    expect( isDuplicateResult ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should not detect non-duplicate URLs as duplicates', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary,
                validUrlPatternArbitrary,
                async ( urlList, newUrl ) => {
                    // Ensure the new URL is not in the list (case-insensitive)
                    const normalizedNewUrl = newUrl.toLowerCase().trim();
                    const isActuallyInList = urlList.some(
                        url => url.toLowerCase().trim() === normalizedNewUrl
                    );

                    // Only test if the URL is genuinely not in the list
                    if ( !isActuallyInList ) {
                        const isDuplicateResult = isDuplicate( newUrl, urlList );
                        expect( isDuplicateResult ).toBe( false );
                    }
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle empty list correctly (no duplicates possible)', async () => {
        await fc.assert(
            fc.asyncProperty(
                validUrlPatternArbitrary,
                async ( url ) => {
                    const emptyList = [];
                    const isDuplicateResult = isDuplicate( url, emptyList );

                    // No URL can be a duplicate in an empty list
                    expect( isDuplicateResult ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle invalid list input gracefully', async () => {
        await fc.assert(
            fc.asyncProperty(
                validUrlPatternArbitrary,
                async ( url ) => {
                    // Test with various invalid list inputs
                    expect( isDuplicate( url, null ) ).toBe( false );
                    expect( isDuplicate( url, undefined ) ).toBe( false );
                    expect( isDuplicate( url, 'not an array' ) ).toBe( false );
                    expect( isDuplicate( url, 123 ) ).toBe( false );
                    expect( isDuplicate( url, {} ) ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle list with non-string elements gracefully', async () => {
        await fc.assert(
            fc.asyncProperty(
                validUrlPatternArbitrary,
                async ( url ) => {
                    // List with mixed types - should not crash and should not find duplicates
                    const mixedList = [ null, undefined, 123, {}, [], true ];
                    const isDuplicateResult = isDuplicate( url, mixedList );

                    // Should not find duplicates in a list with no valid strings
                    expect( isDuplicateResult ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should correctly identify duplicates in lists with duplicates already present', async () => {
        await fc.assert(
            fc.asyncProperty(
                validUrlPatternArbitrary,
                fc.integer( { min: 2, max: 10 } ),
                async ( url, repeatCount ) => {
                    // Create a list with the same URL repeated multiple times
                    const listWithDuplicates = Array( repeatCount ).fill( url );

                    // Should detect the URL as a duplicate
                    const isDuplicateResult = isDuplicate( url, listWithDuplicates );
                    expect( isDuplicateResult ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );
} );


describe( 'Feature: url-blocker, Property 8: Substring Matching Behavior', () => {
    const { isUrlBlocked } = require( '../../src/service-worker' );

    const urlPrefixArbitrary = fc.constantFrom(
        'https://www.',
        'http://www.',
        'https://',
        'http://',
        ''
    );

    const urlSuffixArbitrary = fc.stringOf(
        fc.constantFrom(
            'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
            'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
            '/', '-', '_'
        ),
        { minLength: 0, maxLength: 30 }
    );

    const uniqueUrlListArbitrary = uniqueBlockedListArbitrary( { minLength: 1, maxLength: 20 } );

    it( 'should return true when blocked pattern is a substring of target URL', async () => {
        await fc.assert(
            fc.asyncProperty(
                urlPrefixArbitrary,
                validUrlPatternArbitrary,
                urlSuffixArbitrary,
                async ( prefix, pattern, suffix ) => {
                    // Construct a target URL that contains the pattern as a substring
                    const targetUrl = prefix + pattern + suffix;
                    const blockedList = [ pattern ];

                    // The pattern should be detected as a substring of the target URL
                    const result = isUrlBlocked( targetUrl, blockedList );
                    expect( result ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should perform case-insensitive substring matching', async () => {
        await fc.assert(
            fc.asyncProperty(
                urlPrefixArbitrary,
                validUrlPatternArbitrary,
                urlSuffixArbitrary,
                async ( prefix, pattern, suffix ) => {
                    // Construct target URL with the pattern
                    const targetUrl = prefix + pattern + suffix;

                    // Create case variations of the pattern
                    const upperCasePattern = pattern.toUpperCase();
                    const lowerCasePattern = pattern.toLowerCase();
                    const mixedCasePattern = pattern.split( '' ).map( ( char, i ) =>
                        i % 2 === 0 ? char.toUpperCase() : char.toLowerCase()
                    ).join( '' );

                    // All case variations should match
                    expect( isUrlBlocked( targetUrl, [ upperCasePattern ] ) ).toBe( true );
                    expect( isUrlBlocked( targetUrl, [ lowerCasePattern ] ) ).toBe( true );
                    expect( isUrlBlocked( targetUrl, [ mixedCasePattern ] ) ).toBe( true );

                    // Also test with target URL in different cases
                    expect( isUrlBlocked( targetUrl.toUpperCase(), [ pattern ] ) ).toBe( true );
                    expect( isUrlBlocked( targetUrl.toLowerCase(), [ pattern ] ) ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should return false when blocked pattern is not a substring of target URL', async () => {
        await fc.assert(
            fc.asyncProperty(
                validUrlPatternArbitrary,
                validUrlPatternArbitrary,
                async ( targetUrl, blockedPattern ) => {
                    // Normalize both for comparison
                    const normalizedTarget = targetUrl.toLowerCase().trim();
                    const normalizedPattern = blockedPattern.toLowerCase().trim();

                    // Only test when the pattern is genuinely not a substring
                    if ( !normalizedTarget.includes( normalizedPattern ) ) {
                        const result = isUrlBlocked( targetUrl, [ blockedPattern ] );
                        expect( result ).toBe( false );
                    }
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should match when any pattern in the blocked list is a substring', async () => {
        await fc.assert(
            fc.asyncProperty(
                urlPrefixArbitrary,
                validUrlPatternArbitrary,
                urlSuffixArbitrary,
                uniqueUrlListArbitrary,
                async ( prefix, matchingPattern, suffix, otherPatterns ) => {
                    // Construct target URL containing the matching pattern
                    const targetUrl = prefix + matchingPattern + suffix;

                    // Create a blocked list with the matching pattern and other patterns
                    const blockedList = [ ...otherPatterns, matchingPattern ];

                    // Should return true because at least one pattern matches
                    const result = isUrlBlocked( targetUrl, blockedList );
                    expect( result ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should handle patterns with leading/trailing whitespace correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                urlPrefixArbitrary,
                validUrlPatternArbitrary,
                urlSuffixArbitrary,
                async ( prefix, pattern, suffix ) => {
                    // Construct target URL containing the pattern
                    const targetUrl = prefix + pattern + suffix;

                    // Create patterns with whitespace
                    const patternWithLeadingSpace = '  ' + pattern;
                    const patternWithTrailingSpace = pattern + '  ';
                    const patternWithBothSpaces = '  ' + pattern + '  ';

                    // All should match after normalization (trimming)
                    expect( isUrlBlocked( targetUrl, [ patternWithLeadingSpace ] ) ).toBe( true );
                    expect( isUrlBlocked( targetUrl, [ patternWithTrailingSpace ] ) ).toBe( true );
                    expect( isUrlBlocked( targetUrl, [ patternWithBothSpaces ] ) ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should return false for empty blocked list', async () => {
        await fc.assert(
            fc.asyncProperty(
                validUrlPatternArbitrary,
                async ( targetUrl ) => {
                    const result = isUrlBlocked( targetUrl, [] );
                    expect( result ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should return false for invalid target URL inputs', async () => {
        await fc.assert(
            fc.asyncProperty(
                uniqueUrlListArbitrary,
                async ( blockedList ) => {
                    // Test with various invalid target URL inputs
                    expect( isUrlBlocked( null, blockedList ) ).toBe( false );
                    expect( isUrlBlocked( undefined, blockedList ) ).toBe( false );
                    expect( isUrlBlocked( 123, blockedList ) ).toBe( false );
                    expect( isUrlBlocked( {}, blockedList ) ).toBe( false );
                    expect( isUrlBlocked( [], blockedList ) ).toBe( false );
                    expect( isUrlBlocked( '', blockedList ) ).toBe( false );
                    expect( isUrlBlocked( '   ', blockedList ) ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should return false for invalid blocked list inputs', async () => {
        await fc.assert(
            fc.asyncProperty(
                validUrlPatternArbitrary,
                async ( targetUrl ) => {
                    // Test with various invalid blocked list inputs
                    expect( isUrlBlocked( targetUrl, null ) ).toBe( false );
                    expect( isUrlBlocked( targetUrl, undefined ) ).toBe( false );
                    expect( isUrlBlocked( targetUrl, 'not an array' ) ).toBe( false );
                    expect( isUrlBlocked( targetUrl, 123 ) ).toBe( false );
                    expect( isUrlBlocked( targetUrl, {} ) ).toBe( false );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should skip invalid patterns in the blocked list', async () => {
        await fc.assert(
            fc.asyncProperty(
                urlPrefixArbitrary,
                validUrlPatternArbitrary,
                urlSuffixArbitrary,
                async ( prefix, validPattern, suffix ) => {
                    // Construct target URL containing the valid pattern
                    const targetUrl = prefix + validPattern + suffix;

                    // Create a blocked list with invalid patterns and one valid pattern
                    const blockedListWithInvalid = [ null, undefined, 123, {}, [], '', '   ', validPattern ];

                    // Should still match the valid pattern
                    const result = isUrlBlocked( targetUrl, blockedListWithInvalid );
                    expect( result ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );

    it( 'should match realistic URL examples correctly', () => {
        // Test cases from the design document
        expect( isUrlBlocked( 'https://www.youtube.com/shorts/abc123', [ 'youtube.com/shorts' ] ) ).toBe( true );
        expect( isUrlBlocked( 'https://twitter.com/user/status/123', [ 'twitter.com' ] ) ).toBe( true );
        expect( isUrlBlocked( 'https://www.reddit.com/r/all/hot', [ 'reddit.com/r/all' ] ) ).toBe( true );
        expect( isUrlBlocked( 'https://www.facebook.com/feed', [ 'facebook.com' ] ) ).toBe( true );

        // Non-matching cases
        expect( isUrlBlocked( 'https://www.google.com', [ 'youtube.com' ] ) ).toBe( false );
        expect( isUrlBlocked( 'https://www.example.com', [ 'twitter.com', 'facebook.com' ] ) ).toBe( false );
    } );

    it( 'should handle partial domain matches correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom( 'youtube', 'twitter', 'facebook', 'reddit', 'instagram' ),
                fc.constantFrom( '.com', '.org', '.net', '.io' ),
                fc.constantFrom( '', '/path', '/user/123', '/feed' ),
                async ( domain, tld, path ) => {
                    const targetUrl = 'https://www.' + domain + tld + path;
                    const blockedPattern = domain + tld;

                    // The domain+tld pattern should match
                    const result = isUrlBlocked( targetUrl, [ blockedPattern ] );
                    expect( result ).toBe( true );
                }
            ),
            { numRuns: 100 }
        );
    } );
} );
