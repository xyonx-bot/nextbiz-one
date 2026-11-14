# NextBiz One — image prompts for ChatGPT

**What this is.** 16 images, each mapped to a specific place in the app. They come in two families, so everything looks like one brand:

- **A. Photos** (6): warm, real-looking scenes of Indian small businesses, for the sign-in pages, onboarding and link previews.
- **B. Clay illustrations** (10): small soft-3D objects on a transparent background, for empty states and "not connected" screens.

**Before you start**
- ChatGPT can make three sizes: **square 1024×1024**, **landscape 1536×1024** and **portrait 1024×1536**. Each prompt says which one to use.
- **Family B:** say "transparent background" and download as PNG. If the background comes out cream instead, that's fine too: it matches the app's background colour (#F7F3EB).
- **No text, logos or app screens in any image.** The app draws its own chat bubbles and numbers on top. AI-drawn text and logos come out garbled, and real WhatsApp or Instagram logos are trademarks.
- Brand colours used in the prompts: lime green **#91C82B** (WhatsApp/chat), orange **#FF7518** (ads), pink **#F74770** (Instagram/social), purple **#A66BFF** (automation), yellow **#FFD21F** (highlights), on warm cream **#F7F3EB**.
- **Naming:** save each file with the name in its heading and send them over. I'll place them, crop and compress them (to WebP), and add dark-mode handling.

**Priority:** do 1–3 and 7–12 first. They replace the most visible empty spaces.

---

## A. Photos

### 1. `auth-login.jpg`: sign-in page, left panel
**Size:** portrait 1024×1536. **Where:** the left half of /login. Floating chat cards sit on top of it, so the upper-middle area must stay calm.

> A warm, natural photograph of a young Indian woman, around 30, who runs a small home bakery. She stands at a wooden kitchen counter, smiling as she reads a message on her smartphone in one hand. Beside her are boxes of fresh cupcakes and a cheesecake with mango slices. Soft late-afternoon window light from the left, golden and gentle. Shallow depth of field, the background softly blurred: open shelves with jars, a plant, cream walls. Colours: warm cream and beige overall, with small accents of lime green (a tea towel) and orange (mangoes). Upper-middle third of the frame: simple and uncluttered, mostly soft blurred wall, because interface cards will be placed there. Her face and phone sit in the lower-middle third. Shot on a 50mm lens, editorial lifestyle photography, authentic not stock-like, natural skin texture, relaxed candid moment. No text, no logos, no readable phone screen (the screen shows a soft glow only). Vertical 2:3 composition.

### 2. `auth-signup.jpg`: create-account page, left panel
**Size:** portrait 1024×1536. **Where:** /signup, the same left panel as image 1, but a different business.

> A natural photograph of a cheerful Indian man in his mid-30s who runs a small clothing boutique. He sits behind a wooden shop counter, typing a reply on his smartphone with both thumbs, a slight smile. Behind him: neatly folded colourful kurtas and sarees on shelves, softly out of focus. Warm ambient shop lighting with soft daylight from the shop front. Palette: warm creams and wood tones, with pops of pink (#F74770-like fabric), purple and orange in the textiles. Keep the upper-middle third of the frame simple (soft blurred shelves or wall) for overlaid interface cards. Subject in the lower half. 50mm lens, shallow depth of field, editorial documentary style, genuine and unposed. No text, no shop signs with letters, no logos, phone screen not readable. Vertical 2:3.

### 3. `auth-request.jpg`: request-access page, left panel
**Size:** portrait 1024×1536. **Where:** /request-access, the same left panel.

> A warm photograph of two Indian small-business owners, a woman and a man in their late 20s, partners in a small café, looking at a smartphone together and smiling as if a new customer just messaged. They lean on a café counter with a coffee machine, glass jars of cookies and a small potted plant. Morning sunlight, soft and warm, gentle lens flare from the right. Palette: cream, warm wood, terracotta, with a lime-green accent (cups or an apron). Upper-middle third calm and uncluttered (soft blurred wall or window) for interface overlays; people in the lower half of the frame. Editorial lifestyle photography, 50mm, shallow depth of field, authentic, natural expressions. No text, no menus with words, no logos, no readable screens. Vertical 2:3.

### 4. `onboarding-welcome.jpg`: first-run welcome
**Size:** landscape 1536×1024. **Where:** the top of /onboarding, the first screen after a new client signs up. Shown cropped to a wide banner, so keep the subject centred.

> A bright, optimistic photograph of an Indian woman in her 40s who runs a small florist shop. She stands at her shop entrance, holding a smartphone in one hand and a bunch of marigolds and roses in the other, looking happily at the phone. Buckets of colourful flowers around her: orange marigolds, pink roses, yellow chrysanthemums, green leaves. Soft morning daylight, warm and airy. Palette: orange, pink and yellow flowers against cream walls and green foliage. Subject centred, with generous soft background on both sides so the image can be cropped to a wide banner. Editorial lifestyle photo, 35mm, shallow depth of field, natural and joyful. No text, no signboards, no logos, phone screen unreadable. Horizontal 3:2.

### 5. `og-share.jpg`: link preview when the app's link is shared
**Size:** landscape 1536×1024; I'll crop it to 1200×630. **Where:** the preview card when someone pastes a NextBiz link in WhatsApp, Slack or LinkedIn. I'll add the logo and words myself.

> A clean, warm still-life flat lay seen from directly above, on a warm cream surface (#F7F3EB). A modern smartphone lies slightly left of centre with its screen showing only soft lime-green and white abstract shapes, like chat bubbles without any text. Around it, small items from Indian small businesses: a mini cheesecake, a folded colourful silk scarf, a marigold flower, a small paper shopping bag, a cup of chai, a notebook. Soft diffused daylight, gentle long shadows. Accent colours: lime green #91C82B, orange #FF7518, pink #F74770. Leave the right 40% of the frame mostly empty cream space for a logo and headline. Minimal, premium, editorial product photography. No text, no logos, no readable screens. Horizontal 3:2.

### 6. `ads-hero.jpg`: Meta Ads "not connected" screen
**Size:** landscape 1536×1024. **Where:** the right side of the "Connect your Meta ad account" card (currently a bar chart sketch).

> A warm photograph of a young Indian entrepreneur, a woman around 28, sitting at a small desk in a bright home studio, holding a smartphone and looking pleased. In front of her, a laptop shows only soft blurred orange shapes, like a graph without numbers. On the desk: product samples (handmade candles in amber glass), a coffee mug, a small plant. Soft window light, warm afternoon tones. Palette: cream and warm wood, with orange (#FF7518) as the main accent in the candles and a cushion, plus a touch of pink. Subject slightly right of centre. Editorial lifestyle, 35mm, shallow depth of field, authentic. No text, no readable screens, no logos. Horizontal 3:2.

---

## B. Clay illustrations (transparent PNG, square 1024×1024)

**Use the same style sentence in every prompt.** It's already included in each prompt below, so the set matches:
*"Soft 3D clay illustration, rounded chunky shapes, matte clay texture with subtle fingerprints-free smoothness, gentle soft studio lighting from top-left, soft contact shadow beneath, pastel-bright palette, centred object, generous empty margin around it (object fills about 60% of the frame), transparent background, no text, no logos, no letters or numbers anywhere."*

### 7. `art-inbox-empty.png`: inbox with no chats yet
**Where:** /inbox before any customer has messaged (replaces the small icon in the empty state).

> Soft 3D clay illustration of a friendly rounded smartphone standing slightly tilted, with three plump speech bubbles floating out of it: one large lime-green (#91C82B), one white, one small yellow (#FFD21F). Small sparkles around the bubbles suggest messages arriving. Rounded chunky shapes, matte clay texture, gentle soft studio lighting from top-left, soft contact shadow beneath. Pastel-bright palette on cream tones. Centred, object fills about 60% of the frame with generous empty margin. Transparent background. No text, no logos, no letters or numbers, bubbles are blank.

### 8. `art-contacts-empty.png`: no contacts yet
**Where:** /contacts empty state (next to the Add contact and Import CSV buttons).

> Soft 3D clay illustration of a small stack of three rounded contact cards fanned out, each with a simple round avatar circle (no face details, just colour: lime green #91C82B, pink #F74770, purple #A66BFF) and two blank rounded lines. A small plus-sign badge in yellow (#FFD21F) floats at the top-right corner of the front card. Rounded chunky shapes, matte clay texture, soft top-left lighting, soft contact shadow. Centred, fills about 60% of the frame. Transparent background. No text, letters or numbers.

### 9. `art-templates-empty.png`: no message templates yet
**Where:** /templates empty state.

> Soft 3D clay illustration of a rounded chat-message card, like a big speech bubble shaped as a card, with an image area at the top (a tiny clay picture of a sun over a hill) and three blank rounded text lines below, plus two small pill-shaped buttons at the bottom. A purple (#A66BFF) curly-brace-shaped clay ornament leans on its side, and a small lime-green (#91C82B) check-mark seal sticks to the top-right corner. Matte clay texture, soft top-left lighting, soft contact shadow. Centred, fills about 60%. Transparent background. No text, letters or numbers.

### 10. `art-broadcasts-empty.png`: no broadcasts yet
**Where:** /broadcasts empty state.

> Soft 3D clay illustration of a cheerful rounded megaphone in lime green (#91C82B) with a cream mouthpiece, pointing up and to the right, with five small blank speech bubbles in white, pink (#F74770), yellow (#FFD21F) and purple (#A66BFF) flying out in a gentle arc like confetti. Rounded chunky shapes, matte clay texture, soft top-left studio lighting, soft contact shadow. Centred, fills about 60%. Transparent background. No text, letters or numbers.

### 11. `art-automation.png`: automation / auto-replies
**Where:** /automation empty and intro state, and the "auto-reply" hint cards.

> Soft 3D clay illustration of a small friendly round robot head in purple (#A66BFF) with two simple dot eyes and a little antenna tipped with a yellow (#FFD21F) ball, holding a white blank speech bubble, next to a lime-green (#91C82B) lightning bolt. Cute but professional, not childish. Rounded chunky shapes, matte clay texture, soft top-left lighting, soft contact shadow. Centred, fills about 60%. Transparent background. No text, letters or numbers.

### 12. `art-launch.png`: dashboard launch pad (new workspace)
**Where:** the home dashboard "Launch pad" shown before any activity.

> Soft 3D clay illustration of a small rounded rocket in cream and lime green (#91C82B) with an orange (#FF7518) fin, lifting off from a smartphone lying flat, with a soft puffy white cloud trail and three small floating speech bubbles in pink, yellow and purple. Optimistic, playful, premium. Rounded chunky shapes, matte clay texture, soft top-left lighting, soft contact shadow. Centred, fills about 60%. Transparent background. No text, letters or numbers.

### 13. `art-instagram.png`: Instagram not connected / no comments yet
**Where:** NextBiz Social "connect Instagram" screen and the empty comments page.

> Soft 3D clay illustration of a rounded square photo frame in a pink-to-purple gradient (#F74770 to #A66BFF) with a tiny clay picture inside (a pot plant), surrounded by a floating clay heart in pink, a small blank comment bubble in white, and a little paper plane in yellow (#FFD21F). Do NOT draw the Instagram logo or a camera-icon logo. Rounded chunky shapes, matte clay texture, soft top-left lighting, soft contact shadow. Centred, fills about 60%. Transparent background. No text, letters or numbers.

### 14. `art-whatsapp-connect.png`: WhatsApp not connected
**Where:** the "Connect WhatsApp" screens (Connections page and the guided setup on Inbox, Templates and Broadcasts).

> Soft 3D clay illustration of a rounded smartphone in cream with a lime-green (#91C82B) chat bubble on its screen, connected by a short chunky clay cable with a plug to a small rounded storefront (awning striped lime green and cream). A small yellow (#FFD21F) spark where the plug meets the phone. Do NOT draw the WhatsApp logo or a phone-in-bubble logo. Rounded chunky shapes, matte clay texture, soft top-left lighting, soft contact shadow. Centred, fills about 60%. Transparent background. No text, letters or numbers.

### 15. `art-ads-waiting.png`: Ads performance before any results
**Where:** /ads/performance when nothing has delivered yet (next to "Your ads are live — the first numbers are on their way").

> Soft 3D clay illustration of a rounded hourglass in orange (#FF7518) and cream with yellow (#FFD21F) sand, standing beside three short rounded bar-chart columns in lime green, orange and pink that are just starting to grow (the shortest is tiny), with a small sparkle above the tallest. Calm, hopeful. Rounded chunky shapes, matte clay texture, soft top-left lighting, soft contact shadow. Centred, fills about 60%. Transparent background. No text, letters or numbers, no axis labels.

### 16. `art-request-pending.png`: access request under review
**Where:** /request-access status card ("we're reviewing your request").

> Soft 3D clay illustration of a rounded envelope in cream with a lime-green (#91C82B) seal, resting against a small round clock in yellow (#FFD21F) with simple hands. A tiny purple (#A66BFF) check-mark badge floats nearby, suggesting approval is coming. Rounded chunky shapes, matte clay texture, soft top-left lighting, soft contact shadow. Centred, fills about 60%. Transparent background. No text, letters or numbers.

---

### If something comes out wrong
- **Text appears:** reply "same image, remove all text and letters".
- **Background isn't transparent:** reply "same image on a transparent background, PNG", or keep the cream background; that still works.
- **Style drifts between illustrations:** paste one finished illustration back in and say "match this exact style" before the next prompt.
- **Photos look too stock-like:** add "candid, imperfect, documentary, natural light, not posed".
