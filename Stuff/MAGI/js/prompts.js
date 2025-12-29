// Character Definitions (Source of Truth)
const characterProfiles = {
    witch: {
        name: "Witch Yawn",
        icon: "💤",
        visual: "Young adult. Very slender body. Messy Orange hair. Face: Half-open sleepy eyes (half-lidded), distinct SHORT THICK OVAL EYEBROWS (Shiba-brows/Maro-mayu). Wearing Nightcap + Spiral Earmuffs.",
        personality: "Introverted, Kind-hearted, tries to hide laziness but fails. When faced with work or requests, she mutters '귀차나...' (Troublesome) but does it anyway.",
        speech: "Polite (Jondaemal), soft-spoken, slightly shy, often yawns '(하품)'. Only mutters '귀차나...' when given a task or work.",
        firstMessage: "안녕하세요... 졸리지만... 도와드릴까요? (하품)"
    },
    alisa: {
        name: "Maid Alisa",
        icon: "🧹",
        visual: "Stoic cool beauty. Glasses. Maid outfit. Black ponytail.",
        personality: "Cool, intellectual, strict but loyal, takes care of the lazy witch.",
        speech: "Formal, polite (Honorifics/Jondaemal), slightly strict when Yawn is lazy, efficient.",
        firstMessage: "안녕하십니까. 마녀님의 저택에 오신 것을 환영합니다. 무엇을 도와드릴까요?"
    },
    ling: {
        name: "Jiangshi Ling",
        icon: "🧟‍♀️",
        visual: "Cute baby face, glamorous body. Twin-buns. Qipao. Paper talisman on forehead.",
        personality: "Cheerful, energetic, childish, innocent, mischievous.",
        speech: "Energetic, cute, uses exclamation marks! Ends sentences with '~해' or '~다해' (Cute tone).",
        firstMessage: "안녕! 나는 링이야! 같이 놀자! 헤헤!"
    },
    director: {
        name: "Director (World Builder)",
        icon: "🎬",
        visual: "Invisible Observer / Creative Assistant",
        personality: "Creative, Analytical, Helpful. Acts as a co-writer for the user.",
        speech: "Professional, Insightful, Encouraging. Uses clear formatting for ideas.",
        firstMessage: "안녕하세요! 세계관 설정과 스토리 창작을 도와드릴게요. 무엇을 만들어볼까요? (랜덤 주제, 에피소드 생성, 설정 추가 등)"
    }
};

const worldSetting = `
World Setting:
- Genre: Bright Medieval Fantasy (Healing, Slice of Life).
- Location: A giant tree mansion inside a deep forest. The Witch 'Yawn' lives here.
- Atmosphere: Warm sunlight, cozy wooden furniture, magical but peaceful.
`;

// Generate Context for Image Generation (Visual + Personality)
const charContext = `

Characters:
${Object.values(characterProfiles).filter(c => c.name !== "Director (World Builder)").map((c, i) => `${i+1}. ${c.name}: ${c.visual} Personality: ${c.personality}`).join('\n')}
`;

// Helper for Chat System Prompt (Visual + Personality + Speech)
function getChatSystemPrompt(id) {
    const c = characterProfiles[id];
    
    if (id === 'director') {
        return `You are the 'Director' and 'World Builder' for the project 'Witch: Mendokusai~'.
        Your role is to assist the user in creating stories, episodes, and expanding the lore.
        
        [Existing Characters & Lore]
        ${charContext}
        
        [Your Capabilities]
        1. Random Topics: Suggest interesting scenarios or "What if" situations.
        2. Episode Creation: Write short stories or scripts using the existing characters.
        3. Lore Expansion: Help define pasts, hobbies, or new traits for characters.
        
        Respond in Korean. Be creative and organized. Use markdown for readability.`;
    }

    return `You are '${c.name}'.
    Personality: ${c.personality}
    Appearance: ${c.visual}
    Speech Style: ${c.speech}

    [World Setting]: ${worldSetting}

    Roleplay strictly as this character. Do not break character. Respond in Korean.`;
}

const presetsData = {
    char: [
        { id: 'witch', icon: '💤', label: '마녀 욘', prompt: `Character design sheet, high quality anime style 2D illustration. A young adult witch (Yawn). **Very slender body, flat chest (petite).** **Messy Orange hair.** Face: Half-open sleepy eyes (half-lidded), distinctive short thick eyebrows (maro-mayu), **wearing round glasses**, **slightly blushing cheeks (shy)**, expression of finding things troublesome but trying to hide it. 
        **Headwear: Drooping Nightcap (sleeping hat). Accessories: Large fluffy sleeping earmuffs with an ORANGE spiral pattern.** Outfit: Oversized loose fitting witch robe falling off shoulder. Introverted and cute atmosphere, soft colors, 16:9 aspect ratio.` },
        { id: 'alisa', icon: '🧹', label: '메이드 알리사', prompt: `Character design sheet, high quality anime style 2D illustration. A cute maid (Alisa). Face: Sharp intellectual eyes, stylish glasses (megane), stoic cool beauty expression. Black ponytail. Wearing a classic black and white maid outfit. Holding a large magical broomstick. Dynamic posing. Clean background, detailed, 16:9 aspect ratio.` },
        { id: 'ling', icon: '🧟‍♀️', label: '강시 링', prompt: `Character design sheet, high quality anime style 2D illustration. A beautiful Jiangshi (Chinese vampire) maid girl named Ling. Face: Innocent baby face, mischievous smile. Body: Glamorous and curvy. Dark brown hair in cute twin-buns. Costume: Black Qipao-Maid fusion dress, form-fitting with frills. Paper talisman on forehead. Floating pose. White background, detailed, 16:9 aspect ratio.` }
    ],
    bg: [
        { id: 'ingame', icon: '🎮', label: '인게임 화면', prompt: `Anime style game screenshot, direct top-down view (90 degree overhead). Wide angle shot. HD-2D style (3D Background + Pixel Art). Setting: Inside a cozy wooden mansion. Wooden floor layout with stairs and rugs. Scattered books, magical effects. Amber-like windows. Simple and cute chibi pixel art characters (SD style) fighting. Maid Alisa sweeping blue slimes. Jiangshi Ling swinging censer. Warm sunlight, god rays. High quality, 16:9 aspect ratio.` },
        { id: 'keyVisual', icon: '🖼️', label: '키 비주얼', prompt: `Anime style game key visual illustration. Wide angle panoramic view. Interior of a cozy wooden magical mansion. Circular library room with spiral stairs. Foreground: A stoic cute maid (Alisa) with glasses and broom. 
        Background: A **very slender** lazy witch (Yawn) with orange hair, **wearing glasses, nightcap and orange spiral earmuffs**, sleeping on a sofa. 
        Next to her, a beautiful Jiangshi maid (Ling) in a black Qipao-Maid fusion dress. Warm sunlight beaming down, detailed background, 16:9 aspect ratio.` },
        { id: 'lobby', icon: '🏠', label: '로비 (거실)', prompt: `Anime game background art. Wide shot of the main lobby of a wooden magical mansion. A cozy living room with a large, comfy sofa filled with messy pillows and blankets. Wooden floors, scattered magical books, and a warm fireplace. A feeling of laziness and peace. HD-2D style, bright and welcoming atmosphere, 16:9 aspect ratio.` },
        { id: 'lab', icon: '⚗️', label: '실험실', prompt: `Anime background art. Wide angle shot of a magical laboratory inside a wooden mansion. Curved wooden walls, messy bookshelves, scattered papers, alchemy flasks. Sunlight streaming through amber windows. Dust motes dancing in the light. Warm, cozy, slightly cluttered but charming atmosphere. 16:9 aspect ratio.` }
    ],
    story: [
        { id: 'ep1', icon: '🍞', label: 'Ep1. 아침', prompt: `Anime visual novel cutscene illustration, wide shot. Sweet morning atmosphere. A messy, sunlit bedroom inside a wooden mansion. A lazy **slender** Witch (Yawn) with orange hair, **glasses, nightcap and orange spiral earmuffs** buried under blankets on a bed. Maid Alisa with glasses stands by the bed holding cinnamon rolls. Cinematic lighting, detailed background, 16:9 aspect ratio.` },
        { id: 'ep2', icon: '🔋', label: 'Ep2. 충전', prompt: `Anime visual novel cutscene illustration, medium shot. Intimate late-night atmosphere. Witch (Yawn) with **glasses, nightcap and earmuffs** and maid Alisa sitting close on a sofa. Witch sleepily leaning in, touching her forehead to Alisa's forehead. Soft blue magical glowing light. Alisa's eyes closed behind glasses. Warm mood. Cinematic lighting, detailed, 16:9 aspect ratio.` },
        { id: 'ep3', icon: '👓', label: 'Ep3. 안경', prompt: `Anime visual novel cutscene illustration, medium shot. Bright afternoon. Maid Alisa stands WITHOUT her glasses, wiping them. Witch (Yawn) with orange hair lying on a sofa, looking at Alisa with sparkling, teasing eyes. Sunlight fills the room. Cinematic lighting, high quality, 16:9 aspect ratio.` },
        { id: 'ep4', icon: '🍳', label: 'Ep4. 요리', prompt: `Anime visual novel cutscene illustration, wide shot. Comical kitchen chaos. A fantasy kitchen with a giant cauldron bubbling over with purple goo. Maid Alisa pointing angrily at a large batter stain on the ceiling. Witch (Yawn) with **glasses, nightcap and earmuffs** looking away guiltily. Broken eggshells everywhere. Cinematic lighting, 16:9 aspect ratio.` },
        { id: 'ep5', icon: '🌙', label: 'Ep5. 악몽', prompt: `Anime visual novel cutscene illustration, close up. Emotional night scene. Dark bedroom, moonlight. Witch (Yawn) with **glasses, nightcap and earmuffs** sitting up in bed, looking scared from nightmare. Maid Alisa holding the witch's hand gently, looking concerned. Cinematic lighting, 16:9 aspect ratio.` },
        { id: 'ep6', icon: '❄️', label: 'Ep6. 쿨팩', prompt: `Anime visual novel cutscene illustration, medium shot. Hot summer afternoon atmosphere. A lazy **slender** Witch (Yawn) with orange hair, **glasses, nightcap and orange spiral earmuffs** is sweating and sleeping on a sofa. A beautiful Jiangshi maid (Ling) is hugging the Witch from behind with a blissful expression. Ling's yellow paper talisman on her forehead says 'Happy' in Kanji. The Witch looks relieved and cool. Warm sunlight, detailed, 16:9 aspect ratio.` },
        { id: 'ep7', icon: '😳', label: 'Ep7. 부적', prompt: `Anime visual novel cutscene illustration, close up. A beautiful Jiangshi maid (Ling) looking shy and blushing, trying to hide her face with a fan or hands. But the yellow paper talisman on her forehead clearly shows the Kanji for 'Love' (愛) or 'Joy' (喜). The Witch (Yawn) is laughing in the background. Cute comedy atmosphere. 16:9 aspect ratio.` }
    ],
    lab: [
        { id: 'exp_sheep', icon: '🐏', label: '실험: 양 수인', prompt: `Character design sheet, anime style 2D illustration. Witch Yawn transformed into a Sheep Hybrid. **Curled Ram Horns (spiral shape) on the side of her head instead of earmuffs.** Messy Orange hair, half-lidded eyes, Shiba-brows, glasses. Wearing her usual loose robe. Cute sheep ears. Soft pastel colors, 16:9 aspect ratio.` },
        { id: 'exp_earmuffs', icon: '🎧', label: '실험: 귀마개만', prompt: `Character design sheet, anime style 2D illustration. Witch Yawn without her hat. **Messy Orange hair is fully visible.** Wearing **Large fluffy Sleeping Earmuffs with an ORANGE spiral pattern** directly on her ears. Half-lidded eyes, Shiba-brows, glasses. Oversized robe. Natural look, 16:9 aspect ratio.` },
        { id: 'exp_winter', icon: '❄️', label: '실험: 방한모', prompt: `Character design sheet, anime style 2D illustration. Witch Yawn wearing a **Winter Trapper Hat (Ushanka style) but with a pointy top like a witch hat.** The ear flaps covering her ears have a **distinct spiral pattern.** Fur lining. Messy Orange hair, half-lidded eyes, glasses. Oversized robe. Cozy winter vibe, 16:9 aspect ratio.` },
    ]
};
