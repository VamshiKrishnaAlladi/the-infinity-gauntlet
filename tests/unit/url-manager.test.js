const {
    validateUrl,
    isDuplicate,
    isUrlBlocked
} = require( '../../src/service-worker' );

describe( 'URL Manager (service-worker)', () => {
    describe( 'validateUrl', () => {
        describe( 'valid URLs', () => {
            it( 'should return true for a simple domain', () => {
                expect( validateUrl( 'youtube.com' ) ).toBe( true );
            } );

            it( 'should return true for a URL with path', () => {
                expect( validateUrl( 'youtube.com/shorts' ) ).toBe( true );
            } );

            it( 'should return true for a full URL with protocol', () => {
                expect( validateUrl( 'https://www.youtube.com/shorts' ) ).toBe( true );
            } );

            it( 'should return true for a URL with leading/trailing spaces (after trim)', () => {
                expect( validateUrl( '  youtube.com  ' ) ).toBe( true );
            } );

            it( 'should return true for a single character', () => {
                expect( validateUrl( 'a' ) ).toBe( true );
            } );
        } );

        describe( 'invalid URLs', () => {
            it( 'should return false for an empty string', () => {
                expect( validateUrl( '' ) ).toBe( false );
            } );

            it( 'should return false for a string with only spaces', () => {
                expect( validateUrl( '   ' ) ).toBe( false );
            } );

            it( 'should return false for a string with only tabs', () => {
                expect( validateUrl( '\t\t' ) ).toBe( false );
            } );

            it( 'should return false for a string with only newlines', () => {
                expect( validateUrl( '\n\n' ) ).toBe( false );
            } );

            it( 'should return false for mixed whitespace', () => {
                expect( validateUrl( ' \t \n ' ) ).toBe( false );
            } );

            it( 'should return false for null', () => {
                expect( validateUrl( null ) ).toBe( false );
            } );

            it( 'should return false for undefined', () => {
                expect( validateUrl( undefined ) ).toBe( false );
            } );

            it( 'should return false for a number', () => {
                expect( validateUrl( 123 ) ).toBe( false );
            } );

            it( 'should return false for an object', () => {
                expect( validateUrl( {} ) ).toBe( false );
            } );

            it( 'should return false for an array', () => {
                expect( validateUrl( [] ) ).toBe( false );
            } );
        } );
    } );

    describe( 'isDuplicate', () => {
        describe( 'duplicate detection', () => {
            it( 'should return true for exact match', () => {
                const list = [ 'youtube.com', 'twitter.com' ];
                expect( isDuplicate( 'youtube.com', list ) ).toBe( true );
            } );

            it( 'should return true for case-insensitive match', () => {
                const list = [ 'YouTube.com', 'twitter.com' ];
                expect( isDuplicate( 'youtube.com', list ) ).toBe( true );
            } );

            it( 'should return true for match with different case in input', () => {
                const list = [ 'youtube.com', 'twitter.com' ];
                expect( isDuplicate( 'YOUTUBE.COM', list ) ).toBe( true );
            } );

            it( 'should return true for match with leading/trailing spaces', () => {
                const list = [ 'youtube.com', 'twitter.com' ];
                expect( isDuplicate( '  youtube.com  ', list ) ).toBe( true );
            } );

            it( 'should return true when list item has spaces', () => {
                const list = [ '  youtube.com  ', 'twitter.com' ];
                expect( isDuplicate( 'youtube.com', list ) ).toBe( true );
            } );
        } );

        describe( 'non-duplicate detection', () => {
            it( 'should return false for non-matching URL', () => {
                const list = [ 'youtube.com', 'twitter.com' ];
                expect( isDuplicate( 'facebook.com', list ) ).toBe( false );
            } );

            it( 'should return false for empty list', () => {
                expect( isDuplicate( 'youtube.com', [] ) ).toBe( false );
            } );

            it( 'should return false for partial match', () => {
                const list = [ 'youtube.com/shorts' ];
                expect( isDuplicate( 'youtube.com', list ) ).toBe( false );
            } );

            it( 'should return false for substring match', () => {
                const list = [ 'youtube.com' ];
                expect( isDuplicate( 'youtube.com/shorts', list ) ).toBe( false );
            } );
        } );

        describe( 'edge cases', () => {
            it( 'should return false for non-array list', () => {
                expect( isDuplicate( 'youtube.com', null ) ).toBe( false );
            } );

            it( 'should return false for undefined list', () => {
                expect( isDuplicate( 'youtube.com', undefined ) ).toBe( false );
            } );

            it( 'should handle list with non-string items', () => {
                const list = [ 'youtube.com', null, 123, undefined ];
                expect( isDuplicate( 'youtube.com', list ) ).toBe( true );
                expect( isDuplicate( 'facebook.com', list ) ).toBe( false );
            } );
        } );
    } );

    describe( 'isUrlBlocked', () => {
        describe( 'substring matching', () => {
            it( 'should return true when blocked pattern is substring of target', () => {
                const blockedList = [ 'youtube.com/shorts' ];
                expect( isUrlBlocked( 'https://www.youtube.com/shorts/abc123', blockedList ) ).toBe( true );
            } );

            it( 'should return true for exact match', () => {
                const blockedList = [ 'youtube.com' ];
                expect( isUrlBlocked( 'youtube.com', blockedList ) ).toBe( true );
            } );

            it( 'should return true for domain match in full URL', () => {
                const blockedList = [ 'twitter.com' ];
                expect( isUrlBlocked( 'https://twitter.com/user/status/123', blockedList ) ).toBe( true );
            } );

            it( 'should be case-insensitive', () => {
                const blockedList = [ 'YouTube.com' ];
                expect( isUrlBlocked( 'https://www.youtube.com/watch', blockedList ) ).toBe( true );
            } );

            it( 'should match with different case in target', () => {
                const blockedList = [ 'youtube.com' ];
                expect( isUrlBlocked( 'HTTPS://WWW.YOUTUBE.COM/watch', blockedList ) ).toBe( true );
            } );

            it( 'should match path patterns', () => {
                const blockedList = [ 'reddit.com/r/all' ];
                expect( isUrlBlocked( 'https://www.reddit.com/r/all/hot', blockedList ) ).toBe( true );
            } );
        } );

        describe( 'non-matching URLs', () => {
            it( 'should return false when no pattern matches', () => {
                const blockedList = [ 'youtube.com', 'twitter.com' ];
                expect( isUrlBlocked( 'https://facebook.com', blockedList ) ).toBe( false );
            } );

            it( 'should return false for empty blocked list', () => {
                expect( isUrlBlocked( 'https://youtube.com', [] ) ).toBe( false );
            } );

            it( 'should return false when target is substring of pattern (not vice versa)', () => {
                const blockedList = [ 'youtube.com/shorts/specific' ];
                expect( isUrlBlocked( 'youtube.com/shorts', blockedList ) ).toBe( false );
            } );

            it( 'should return false for partial domain match', () => {
                const blockedList = [ 'tube.com' ];
                expect( isUrlBlocked( 'https://youtube.com', blockedList ) ).toBe( true ); // 'tube.com' IS in 'youtube.com'
            } );
        } );

        describe( 'edge cases', () => {
            it( 'should return false for empty target URL', () => {
                const blockedList = [ 'youtube.com' ];
                expect( isUrlBlocked( '', blockedList ) ).toBe( false );
            } );

            it( 'should return false for whitespace-only target URL', () => {
                const blockedList = [ 'youtube.com' ];
                expect( isUrlBlocked( '   ', blockedList ) ).toBe( false );
            } );

            it( 'should return false for null target URL', () => {
                const blockedList = [ 'youtube.com' ];
                expect( isUrlBlocked( null, blockedList ) ).toBe( false );
            } );

            it( 'should return false for undefined target URL', () => {
                const blockedList = [ 'youtube.com' ];
                expect( isUrlBlocked( undefined, blockedList ) ).toBe( false );
            } );

            it( 'should return false for non-array blocked list', () => {
                expect( isUrlBlocked( 'https://youtube.com', null ) ).toBe( false );
            } );

            it( 'should skip empty patterns in blocked list', () => {
                const blockedList = [ '', '   ', 'youtube.com' ];
                expect( isUrlBlocked( 'https://youtube.com', blockedList ) ).toBe( true );
                expect( isUrlBlocked( 'https://facebook.com', blockedList ) ).toBe( false );
            } );

            it( 'should skip non-string patterns in blocked list', () => {
                const blockedList = [ null, 123, undefined, 'youtube.com' ];
                expect( isUrlBlocked( 'https://youtube.com', blockedList ) ).toBe( true );
            } );

            it( 'should handle URLs with special characters', () => {
                const blockedList = [ 'example.com/path?query=value' ];
                expect( isUrlBlocked( 'https://example.com/path?query=value&other=1', blockedList ) ).toBe( true );
            } );

            it( 'should handle URLs with unicode characters', () => {
                const blockedList = [ 'example.com/日本語' ];
                expect( isUrlBlocked( 'https://example.com/日本語/page', blockedList ) ).toBe( true );
            } );
        } );

        describe( 'multiple patterns', () => {
            it( 'should return true if any pattern matches', () => {
                const blockedList = [ 'youtube.com', 'twitter.com', 'facebook.com' ];
                expect( isUrlBlocked( 'https://twitter.com/home', blockedList ) ).toBe( true );
            } );

            it( 'should check all patterns', () => {
                const blockedList = [ 'nonexistent1.com', 'nonexistent2.com', 'youtube.com' ];
                expect( isUrlBlocked( 'https://youtube.com', blockedList ) ).toBe( true );
            } );
        } );
    } );
} );
