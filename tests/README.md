# Chrome rendering regression fixture

Run `npm run dev` and open `/tests/chrome-rendering.html`. The fixture creates three independent renderer instances for silver, copper and gold, each with 50 px dabs at 100% reflection intensity. Every panel contains a wide horizontal stroke crossed by a vertical and diagonal stroke. The page also reports actual decoded sRGB bytes from representative PNG pixels.

Check that curved environment light strips move across the tube as its normal changes, with soft dark-to-bright transitions and visible material hue. Both crossings should share one continuous surface, without a thin vertical seam or streak beneath the stroke.
