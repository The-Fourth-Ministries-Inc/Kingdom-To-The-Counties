/* AUTO-GENERATED from data/bins.json — do not edit by hand.
   Regenerate with: node scripts/sync-starter-bins.mjs

   The trailer roster as the team recorded it in their inventory sheet.
   Missing bins are merged into the live board on read (same self-seeding
   pattern as the starter scripts and churches); a bin a leader deletes is
   tombstoned and stays deleted, and leader edits are never overwritten. */
export default {
 "trailers": [
  {
   "key": "t1",
   "icon": "🔧",
   "name": "Trailer 1 · Tech / Worship",
   "range": "100s"
  },
  {
   "key": "t2",
   "icon": "📦",
   "name": "Trailer 2 · Logistics & Guest Services",
   "range": "300s · 350s"
  }
 ],
 "sections": [
  {
   "key": "tech",
   "trailer": "t1",
   "name": "Tech / Worship",
   "range": "100–199"
  },
  {
   "key": "logistics",
   "trailer": "t2",
   "name": "Logistics",
   "range": "300–349"
  },
  {
   "key": "guest",
   "trailer": "t2",
   "name": "Guest Services",
   "range": "350–399"
  }
 ],
 "photos": [
  {
   "file": "assets/trailer/left-bay-1.jpg",
   "label": "Left-hand side, first bay",
   "match": [
    "left-hand side, first bay"
   ]
  },
  {
   "file": "assets/trailer/left-bay-2.jpg",
   "label": "Left side, second bay",
   "match": [
    "left side, second bay"
   ]
  },
  {
   "file": "assets/trailer/left-bay-3.jpg",
   "label": "Left side, 3rd bay",
   "match": [
    "left side, 3rd bay"
   ]
  },
  {
   "file": "assets/trailer/right-rack.jpg",
   "label": "Right-hand side, metal rack",
   "match": [
    "right-hand side, metal rack",
    "bottom of metal rack",
    "top of rack"
   ]
  },
  {
   "file": "assets/trailer/right-ark.jpg",
   "label": "Right side, by the Ark",
   "match": [
    "front of ark",
    "above ark",
    "next to side door"
   ]
  },
  {
   "file": "assets/trailer/side-door.jpg",
   "label": "Right side, side door",
   "match": [
    "left of side door",
    "inside side door",
    "across from side door"
   ]
  },
  {
   "file": "assets/trailer/nose-left.jpg",
   "label": "Nose, left side",
   "match": [
    "nose, left side"
   ]
  },
  {
   "file": "assets/trailer/nose-right.jpg",
   "label": "Nose, right side",
   "match": [
    "nose, right side"
   ]
  },
  {
   "file": "assets/trailer/nose-bucket.jpg",
   "label": "Nose, center",
   "match": [
    "nose, center"
   ]
  },
  {
   "file": "assets/trailer/packouts.jpg",
   "label": "The Packout shelf",
   "match": [
    "shelf, leftmost",
    "shelf, middle",
    "shelf, rightmost",
    "shelf, behind packouts"
   ]
  },
  {
   "file": "assets/trailer/packout-stack-1.jpg",
   "label": "Packout stack 1",
   "match": [
    "atop 2u packout 1",
    "atop 1u packout 1"
   ]
  },
  {
   "file": "assets/trailer/packout-stack-2.jpg",
   "label": "Packout stack 2",
   "match": [
    "atop 2u packout 2"
   ]
  },
  {
   "file": "assets/trailer/packout-stack-3.jpg",
   "label": "Packout stack 3",
   "match": [
    "atop 2u packout 3"
   ]
  },
  {
   "file": "assets/trailer/left-rear-end.jpg",
   "label": "Left side, rear",
   "match": [
    "rear end of shelf",
    "just inside gate",
    "strapped to banner pipes",
    "under coffins",
    "hanging from brackets on end of shelf",
    "hanging from end of shelf"
   ]
  },
  {
   "file": "assets/trailer/right-rear-end.jpg",
   "label": "Right side, rear",
   "match": [
    "just inside rear gate"
   ]
  },
  {
   "file": "assets/trailer/aisle-rear.jpg",
   "label": "Centre aisle, from the rear",
   "match": [
    "center aisle",
    "in aisle"
   ]
  },
  {
   "file": "assets/trailer/aisle-nose.jpg",
   "label": "Centre aisle, from the nose",
   "match": [
    "nose end of shelf",
    "stacked drum platforms",
    "next to drum stack",
    "dedicated hook"
   ]
  }
 ],
 "bins": [
  {
   "id": "100",
   "bin": "100",
   "sec": "tech",
   "title": "Cleaning Supplies",
   "items": [
    "bag of rags",
    "roll of black trash bags",
    "white dust pan with hand broom x1",
    "red hand sweepers x2",
    "croc wipes",
    "paper towels"
   ],
   "loc": "Left-hand side, first bay"
  },
  {
   "id": "101",
   "bin": "101",
   "sec": "tech",
   "title": "Green Room Tent",
   "items": [
    "15' sidewall x1",
    "10' sidewalls x2",
    "tent stakes x9"
   ],
   "loc": "Left-hand side, first bay"
  },
  {
   "id": "102",
   "bin": "102",
   "sec": "tech",
   "title": "Front of House Tent",
   "items": [
    "15' zippered front x1",
    "tent stakes x9"
   ],
   "loc": "Left-hand side, first bay"
  },
  {
   "id": "103",
   "bin": "103",
   "sec": "tech",
   "title": "Tarps",
   "items": [
    "tarps x5"
   ],
   "loc": "Left-hand side, first bay"
  },
  {
   "id": "104",
   "bin": "104",
   "sec": "tech",
   "title": "Band Tent 1 (Main)",
   "items": [
    "accessories - 10' side panels x6",
    "20' side panel x1",
    "stakes x8",
    "bag of black hangers"
   ],
   "loc": "Left-hand side, first bay"
  },
  {
   "id": "105",
   "bin": "105",
   "sec": "tech",
   "title": "Band Tent 2 (Extra)",
   "items": [
    "extra panels 10' x2",
    "20' x1",
    "extra stakes",
    "other"
   ],
   "loc": "Left-hand side, first bay"
  },
  {
   "id": "106",
   "bin": "106",
   "sec": "tech",
   "title": "",
   "empty": true,
   "items": [],
   "loc": "Right-hand side, metal rack"
  },
  {
   "id": "107",
   "bin": "107",
   "sec": "tech",
   "title": "Label Maker & Screws",
   "items": [
    "label maker x1",
    "blue fastener toolbox x1"
   ],
   "loc": "Right-hand side, metal rack"
  },
  {
   "id": "108",
   "bin": "108",
   "sec": "tech",
   "title": "Production Misc",
   "items": [
    "laptop stand",
    "IEM accessories",
    "250' CAT 5 ethernet reel",
    "RADIAL"
   ],
   "loc": "Right-hand side, metal rack"
  },
  {
   "id": "109",
   "bin": "109",
   "sec": "tech",
   "title": "Microphones",
   "items": [
    "wireless mic case (wireless mics x12, frequency scanner x1, new green batteries x24)",
    "corded mic case1 (xm8500 [tb] x5)",
    "corded mic case 2 (sm58 x1, drv 100 x1, beta 58a x1, mic stand heads x6)"
   ],
   "loc": "Right-hand side, metal rack"
  },
  {
   "id": "110",
   "bin": "110",
   "sec": "tech",
   "title": "Trailer-Fasteners",
   "items": [
    "tape",
    "zip ties",
    "wall hooks",
    "bolts/screws",
    "megaphones"
   ],
   "loc": "Right-hand side, metal rack"
  },
  {
   "id": "111",
   "bin": "111",
   "sec": "tech",
   "title": "Tiedowns",
   "items": [
    "ratchet straps x?",
    "press-release straps in jug x?",
    "bungee cord jug x1 (empty)",
    "gaffer tape x4",
    "duct tape x1",
    "zip ties misc.",
    "yellow rope"
   ],
   "loc": "Right-hand side, metal rack"
  },
  {
   "id": "112",
   "bin": "112",
   "sec": "tech",
   "title": "Power",
   "items": [
    "extension cords x?",
    "surge protectors x?"
   ],
   "loc": "Right-hand side, metal rack"
  },
  {
   "id": "113",
   "bin": "113",
   "sec": "tech",
   "title": "XLRs",
   "items": [
    "XLRs",
    "snake"
   ],
   "loc": "Right-hand side, metal rack"
  },
  {
   "id": "t1-band-tents-10x20",
   "sec": "tech",
   "kind": "loose",
   "title": "10x20 Band Tents",
   "qty": "2",
   "items": [],
   "loc": "Bound to right side, just inside rear gate"
  },
  {
   "id": "t1-foh-greenroom-tents",
   "sec": "tech",
   "kind": "loose",
   "title": "10x15 FOH/Green Room Tents",
   "qty": "2",
   "items": [],
   "loc": "On top of stacked drum platforms"
  },
  {
   "id": "t1-generator",
   "sec": "tech",
   "kind": "loose",
   "title": "Predator 9500 Generator",
   "qty": "1",
   "items": [],
   "loc": "Center aisle"
  },
  {
   "id": "t1-generator-cover",
   "sec": "tech",
   "kind": "loose",
   "title": "Generator Cover",
   "qty": "1",
   "items": [],
   "loc": "Left side, second bay"
  },
  {
   "id": "t1-gas-can",
   "sec": "tech",
   "kind": "loose",
   "title": "5 Gallon Red Gas Can",
   "qty": "1",
   "items": [],
   "loc": "Left side, second bay"
  },
  {
   "id": "t1-packout-large-starlink",
   "sec": "tech",
   "kind": "loose",
   "title": "Large Rolling Packout — Starlink",
   "qty": "1",
   "items": [
    "Starlink case",
    "stand"
   ],
   "loc": "Left side, second bay"
  },
  {
   "id": "t1-ladder-little-giant",
   "sec": "tech",
   "kind": "loose",
   "title": "Little Giant Ladder",
   "qty": "1",
   "items": [],
   "loc": "Left side, second bay"
  },
  {
   "id": "t1-ladder-step",
   "sec": "tech",
   "kind": "loose",
   "title": "Small Step Ladder",
   "qty": "1",
   "items": [],
   "loc": "Left side, second bay"
  },
  {
   "id": "t1-half-packout-1",
   "sec": "tech",
   "kind": "loose",
   "title": "1/2U Packout 1 — Drum Platform",
   "items": [],
   "loc": "Atop 1U Packout 1, Left side"
  },
  {
   "id": "t1-half-packout-2",
   "sec": "tech",
   "kind": "loose",
   "title": "1/2U Packout 2 — Empty",
   "empty": true,
   "items": [],
   "loc": "Atop 1U Packout 1, Right side"
  },
  {
   "id": "t1-1u-packout-1",
   "sec": "tech",
   "kind": "loose",
   "title": "1U Packout 1 — A/V",
   "items": [],
   "loc": "Atop 2U Packout 1"
  },
  {
   "id": "t1-1u-packout-2",
   "sec": "tech",
   "kind": "loose",
   "title": "1U Packout 2 — Extra Cables",
   "items": [],
   "loc": "Atop 2U Packout 2"
  },
  {
   "id": "t1-1u-packout-3",
   "sec": "tech",
   "kind": "loose",
   "title": "1U Packout 3 — Crane Rig Tools",
   "items": [
    "zip ties (consumable)",
    "snips x8",
    "pipe wrench x2",
    "rubber mallet x1",
    "hacksaw x1"
   ],
   "loc": "Atop 2U Packout 3"
  },
  {
   "id": "t1-2u-packout-1",
   "sec": "tech",
   "kind": "loose",
   "title": "2U Packout 1 — IEM Packs",
   "items": [
    "Top Drawer (IEM packs x8)",
    "Middle Drawer (spare batteries)",
    "Bottom Drawer (patch cables, USB, IEM cables)"
   ],
   "loc": "Shelf, Leftmost"
  },
  {
   "id": "t1-2u-packout-2",
   "sec": "tech",
   "kind": "loose",
   "title": "2U Packout 2 — IEM Paddles",
   "items": [
    "Top Drawer (mic paddle left)",
    "Middle Drawer Upper (mic paddle right)",
    "Middle Drawer Lower (IEM paddle left)",
    "Bottom Drawer (IEM paddle right)"
   ],
   "loc": "Shelf, Middle"
  },
  {
   "id": "t1-2u-packout-3",
   "sec": "tech",
   "kind": "loose",
   "title": "2U Packout 3 — Spares",
   "items": [
    "Top Drawer (spare IEM packs)",
    "Middle Drawer (phone stands, scissors)",
    "Bottom Drawer (headphones, spare ethernet)"
   ],
   "loc": "Shelf, Rightmost"
  },
  {
   "id": "t1-timer-bars",
   "sec": "tech",
   "kind": "loose",
   "title": "Timer bars",
   "qty": "2",
   "items": [],
   "loc": "Right side, top of rack in cardboard boxes"
  },
  {
   "id": "t1-cord-covers",
   "sec": "tech",
   "kind": "loose",
   "title": "Vevor Cord Covers",
   "qty": "16",
   "items": [],
   "loc": "Right side, stacked in bottom of metal rack"
  },
  {
   "id": "t1-ark",
   "sec": "tech",
   "kind": "loose",
   "title": "ARK",
   "qty": "1",
   "items": [],
   "loc": "Right side, next to side door"
  },
  {
   "id": "t1-orange-cones",
   "sec": "tech",
   "kind": "loose",
   "title": "Orange Cones",
   "qty": "26",
   "items": [],
   "loc": "Right side, strapped in front of Ark"
  },
  {
   "id": "t1-first-aid",
   "sec": "tech",
   "kind": "loose",
   "title": "First Aid Kit",
   "qty": "1",
   "items": [],
   "loc": "Right side, above ark"
  },
  {
   "id": "t1-drum-hardware-coffin",
   "sec": "tech",
   "kind": "loose",
   "title": "Drum Hardware Coffin",
   "qty": "2",
   "items": [],
   "loc": "Left side, 3rd bay"
  },
  {
   "id": "t1-mic-stand-coffin",
   "sec": "tech",
   "kind": "loose",
   "title": "Microphone Stand Coffin",
   "qty": "1",
   "items": [],
   "loc": "Left side, 3rd bay"
  },
  {
   "id": "t1-aa-charging-case",
   "sec": "tech",
   "kind": "loose",
   "title": "AA Battery Charging Case",
   "qty": "2",
   "items": [],
   "loc": "Right side, shelf above ark"
  },
  {
   "id": "t1-walkie-talkie",
   "sec": "tech",
   "kind": "loose",
   "title": "Walkie Talkie",
   "qty": "10",
   "items": [],
   "loc": "Right side, shelf above ark"
  },
  {
   "id": "t1-ev-woofer",
   "sec": "tech",
   "kind": "loose",
   "title": "EV Woofer",
   "qty": "2",
   "items": [],
   "loc": "Nose, right side on floor"
  },
  {
   "id": "t1-ev-speakers",
   "sec": "tech",
   "kind": "loose",
   "title": "EV Speakers",
   "qty": "2",
   "items": [],
   "loc": "Nose, right side on floor"
  },
  {
   "id": "t1-television",
   "sec": "tech",
   "kind": "loose",
   "title": "Television",
   "qty": "2",
   "items": [],
   "loc": "Nose, right side hanging from ceiling"
  },
  {
   "id": "t1-cymbal-shield",
   "sec": "tech",
   "kind": "loose",
   "title": "Bass Drum Cymbal Shield",
   "qty": "4",
   "items": [
    "Stored in Bass Drum Case"
   ],
   "loc": "Nose, left side, on wall"
  },
  {
   "id": "t1-cymbal-case",
   "sec": "tech",
   "kind": "loose",
   "title": "Cymbal Case",
   "qty": "1",
   "items": [],
   "loc": "Nose, left side, on wall"
  },
  {
   "id": "t1-bass-drum",
   "sec": "tech",
   "kind": "loose",
   "title": "Bass Drum and Case",
   "qty": "1",
   "items": [],
   "loc": "Nose, left side, on wall"
  },
  {
   "id": "t1-floor-tom",
   "sec": "tech",
   "kind": "loose",
   "title": "Floor Tom and Case",
   "qty": "1",
   "items": [],
   "loc": "Nose, left side, on wall"
  },
  {
   "id": "t1-rack-tom",
   "sec": "tech",
   "kind": "loose",
   "title": "Rack Tom and Case",
   "qty": "2",
   "items": [],
   "loc": "Nose, left side, on wall"
  },
  {
   "id": "t1-snare",
   "sec": "tech",
   "kind": "loose",
   "title": "Snare Drum and Case",
   "qty": "1",
   "items": [],
   "loc": "Nose, left side, on wall"
  },
  {
   "id": "t1-fire-extinguishers",
   "sec": "tech",
   "kind": "loose",
   "title": "Fire Extinguishers",
   "qty": "3",
   "items": [],
   "loc": "Nose, center, on floor"
  },
  {
   "id": "t1-jack",
   "sec": "tech",
   "kind": "loose",
   "title": "Jack",
   "qty": "1",
   "items": [],
   "loc": "Right side, left of side door"
  },
  {
   "id": "t1-jack-stand",
   "sec": "tech",
   "kind": "loose",
   "title": "Jack Stand",
   "qty": "2",
   "items": [],
   "loc": "Right side, left of side door"
  },
  {
   "id": "t1-trailer-hitch",
   "sec": "tech",
   "kind": "loose",
   "title": "Trailer Hitch",
   "qty": "2",
   "items": [],
   "loc": "Right side, left of side door"
  },
  {
   "id": "t1-tv-stand",
   "sec": "tech",
   "kind": "loose",
   "title": "TV Stand",
   "qty": "2",
   "items": [],
   "loc": "Left side, at nose end of shelf"
  },
  {
   "id": "t1-level",
   "sec": "tech",
   "kind": "loose",
   "title": "6' Level",
   "qty": "1",
   "items": [],
   "loc": "Shelf, behind Packouts"
  },
  {
   "id": "t1-jesus-banner",
   "sec": "tech",
   "kind": "loose",
   "title": "Jesus Banner",
   "qty": "5",
   "items": [],
   "loc": "Left side, at nose end of shelf"
  },
  {
   "id": "t1-extension-cords",
   "sec": "tech",
   "kind": "loose",
   "title": "Extension Cords",
   "qty": "5",
   "items": [
    "Red x3",
    "Orange x1",
    "Green x1"
   ],
   "loc": "Nose, left side, next to drum stack"
  },
  {
   "id": "t1-extension-cord-reel",
   "sec": "tech",
   "kind": "loose",
   "title": "Extension Cord Reel",
   "qty": "1",
   "items": [],
   "loc": "Nose, center, on dedicated hook"
  },
  {
   "id": "t1-gen-accessory-pail",
   "sec": "tech",
   "kind": "loose",
   "title": "Generator Accessory Pail",
   "qty": "1",
   "items": [],
   "loc": "Nose, center, on floor"
  },
  {
   "id": "t1-drum-platform",
   "sec": "tech",
   "kind": "loose",
   "title": "Drum Platform (pieces)",
   "qty": "3",
   "items": [],
   "loc": "Left side, at rear end of shelf"
  },
  {
   "id": "t1-banner-pipes",
   "sec": "tech",
   "kind": "loose",
   "title": "Banner Pipes",
   "qty": "8",
   "items": [],
   "loc": "Left side, strapped to the wall just inside gate"
  },
  {
   "id": "t1-red-broom",
   "sec": "tech",
   "kind": "loose",
   "title": "Red Broom",
   "qty": "1",
   "items": [],
   "loc": "Left side, strapped to Banner Pipes"
  },
  {
   "id": "t1-bungie-cords",
   "sec": "tech",
   "kind": "loose",
   "title": "Bungie Cords",
   "qty": "17",
   "items": [],
   "loc": "Left side, hanging from brackets on end of shelf"
  },
  {
   "id": "t1-clip-board",
   "sec": "tech",
   "kind": "loose",
   "title": "Clip Board",
   "qty": "1",
   "items": [],
   "loc": "Left side, hanging from end of shelf"
  },
  {
   "id": "t1-hand-truck",
   "sec": "tech",
   "kind": "loose",
   "title": "Hand Truck",
   "qty": "1",
   "items": [],
   "loc": "Left side, tucked under coffins and bound with strap"
  },
  {
   "id": "t1-wheel-chocks",
   "sec": "tech",
   "kind": "loose",
   "title": "Wheel Chocks (pair)",
   "qty": "2",
   "items": [],
   "loc": "Floor, inside side door when traveling"
  },
  {
   "id": "t1-standing-fan",
   "sec": "tech",
   "kind": "loose",
   "title": "Standing Fan",
   "qty": "1",
   "items": [],
   "loc": "Floor, in aisle across from side door"
  },
  {
   "id": "300",
   "bin": "300",
   "sec": "logistics",
   "title": "Mommy Tote #1",
   "items": [
    "3 paper towels",
    "2 disinfecting wipes",
    "small white garbage weight bag",
    "garbage bag rolls",
    "pack of ponchos",
    "box of baby wipes",
    "blue bag of baby food"
   ],
   "loc": ""
  },
  {
   "id": "301",
   "bin": "301",
   "sec": "logistics",
   "title": "Shade Tote 1",
   "items": [
    "paper towel roll",
    "disinfecting wipes",
    "clear plastic garbage bag",
    "ponchos",
    "tent shade",
    "5x tent stake and back up rope yellow"
   ],
   "loc": ""
  },
  {
   "id": "302",
   "bin": "302",
   "sec": "logistics",
   "title": "Shade Tote 2",
   "items": [
    "clear garbage bags",
    "paper towel roll 1x",
    "disinfecting wipes 1x",
    "one tent shade",
    "tent stakes 7x",
    "shade tent sign"
   ],
   "loc": ""
  },
  {
   "id": "303",
   "bin": "303",
   "sec": "logistics",
   "title": "Fan Tote",
   "items": [
    "6x ryobi fans",
    "multi charging station 1x",
    "3x single charger stations",
    "6x battery packs"
   ],
   "loc": ""
  },
  {
   "id": "304",
   "bin": "304",
   "sec": "logistics",
   "title": "First Aid Tote",
   "items": [
    "2x mini fan boxes (3 fans in each)",
    "first aid kit 1x",
    "blue disposable gloves",
    "wash cloths ~20x",
    "4x tent shade sides red",
    "medical tent sign",
    "ponchos",
    "disinfecting wipes",
    "flushable wipes",
    "thermometer",
    "6x tent stakes",
    "white weight bag for garbage",
    "clear trash bags"
   ],
   "loc": ""
  },
  {
   "id": "305",
   "bin": "305",
   "sec": "logistics",
   "title": "Mommy Tote #2",
   "items": [
    "4x shade tent sides",
    "one sign"
   ],
   "note": "consolidate potentially",
   "loc": ""
  },
  {
   "id": "306",
   "bin": "306",
   "sec": "logistics",
   "title": "Paakin Tote",
   "note": "Parking crew tote",
   "items": [
    "3x tent walls rolled up",
    "6x orange vests",
    "16x fluorescent vests",
    "6x orange flags",
    "6x flashlights",
    "4x yellow caution tape",
    "thin orange roll plastic ribbon/tape",
    "roll clear trash bags",
    "clicker 2x",
    "orange small stake flags 50x pack",
    "white trash bag roll 1x"
   ],
   "loc": ""
  },
  {
   "id": "307",
   "bin": "307",
   "sec": "logistics",
   "title": "Ambassadors",
   "items": [
    "6x shade walls",
    "3 black tent strings"
   ],
   "loc": ""
  },
  {
   "id": "308",
   "bin": "308",
   "sec": "logistics",
   "title": "Logistics Overflow",
   "items": [
    "9 empty tent weight bags (Black)",
    "bug zapper",
    "2 rolls of kitchen bags",
    "plastic knives"
   ],
   "loc": ""
  },
  {
   "id": "309",
   "bin": "309",
   "sec": "logistics",
   "title": "Shade Tote 3",
   "items": [
    "1 shade wall",
    "disinfecting wipes",
    "paper towels",
    "ponchos",
    "clear garbage bags",
    "6 small metal tent stakes",
    "sign"
   ],
   "loc": ""
  },
  {
   "id": "310",
   "bin": "310",
   "sec": "logistics",
   "title": "Prayer Tent",
   "items": [
    "1 shade wall",
    "replacement canopy",
    "extra signs",
    "tissue box",
    "3 sunscreen",
    "permanent marker",
    "3 packs ponchos",
    "2 garbage bag rolls",
    "orange duct tapes",
    "bag of rubber bands",
    "black bag of tent stakes strings and allen wrench",
    "napkins"
   ],
   "loc": ""
  },
  {
   "id": "311",
   "bin": "311",
   "sec": "logistics",
   "title": "Weight Lifter",
   "items": [
    "8 Round tent weights",
    "2 buckled straps"
   ],
   "loc": ""
  },
  {
   "id": "312",
   "bin": "312",
   "sec": "logistics",
   "title": "",
   "empty": true,
   "items": [],
   "loc": ""
  },
  {
   "id": "313",
   "bin": "313",
   "sec": "logistics",
   "title": "",
   "empty": true,
   "items": [],
   "loc": ""
  },
  {
   "id": "314",
   "bin": "314",
   "sec": "logistics",
   "title": "",
   "empty": true,
   "items": [],
   "loc": ""
  },
  {
   "id": "315",
   "bin": "315",
   "sec": "logistics",
   "title": "",
   "empty": true,
   "items": [],
   "loc": ""
  },
  {
   "id": "316",
   "bin": "316",
   "sec": "logistics",
   "title": "",
   "empty": true,
   "items": [],
   "loc": ""
  },
  {
   "id": "317",
   "bin": "317",
   "sec": "logistics",
   "title": "",
   "empty": true,
   "items": [],
   "loc": ""
  },
  {
   "id": "318",
   "bin": "318",
   "sec": "logistics",
   "title": "",
   "empty": true,
   "items": [],
   "loc": ""
  },
  {
   "id": "319",
   "bin": "319",
   "sec": "logistics",
   "title": "",
   "empty": true,
   "items": [],
   "loc": ""
  },
  {
   "id": "320",
   "bin": "320",
   "sec": "logistics",
   "title": "",
   "empty": true,
   "items": [],
   "loc": ""
  },
  {
   "id": "321",
   "bin": "321",
   "sec": "logistics",
   "title": "",
   "empty": true,
   "items": [],
   "loc": ""
  },
  {
   "id": "322",
   "bin": "322",
   "sec": "logistics",
   "title": "",
   "empty": true,
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-blue-coolers",
   "sec": "logistics",
   "kind": "loose",
   "title": "blue coolers",
   "qty": "3",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-white-folding-chairs",
   "sec": "logistics",
   "kind": "loose",
   "title": "white folding chairs",
   "qty": "10",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-gorrilla-cart",
   "sec": "logistics",
   "kind": "loose",
   "title": "Gorilla Cart",
   "qty": "1",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-wheel-chocks",
   "sec": "logistics",
   "kind": "loose",
   "title": "Wheel Chocks (pair)",
   "qty": "2",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-tongue-lock",
   "sec": "logistics",
   "kind": "loose",
   "title": "Tongue Lock",
   "qty": "1",
   "items": [],
   "loc": ""
  },
  {
   "id": "350",
   "bin": "350",
   "sec": "guest",
   "title": "Green T Shirt Tote",
   "items": [
    "many green t4 t-shirts"
   ],
   "loc": ""
  },
  {
   "id": "351",
   "bin": "351",
   "sec": "guest",
   "title": "Lilac T Shirt Tote",
   "items": [
    "Lilac t4 t shirts many"
   ],
   "loc": ""
  },
  {
   "id": "352",
   "bin": "352",
   "sec": "guest",
   "title": "Rocks Box",
   "items": [
    "15x small rock white bags"
   ],
   "loc": ""
  },
  {
   "id": "353",
   "bin": "353",
   "sec": "guest",
   "title": "Grey Glory Hoodies Tote",
   "items": [
    "Grey sweatshirts fireproof faith"
   ],
   "loc": ""
  },
  {
   "id": "354",
   "bin": "354",
   "sec": "guest",
   "title": "Jesus is King Case",
   "items": [
    "Jesus is King hats cream and maroon"
   ],
   "loc": ""
  },
  {
   "id": "355",
   "bin": "355",
   "sec": "guest",
   "title": "Home Tote",
   "items": [
    "It Starts at Home t shirts"
   ],
   "loc": ""
  },
  {
   "id": "356",
   "bin": "356",
   "sec": "guest",
   "title": "Fishing Pole Shirt",
   "items": [
    "Cream t shirts raise his name high"
   ],
   "loc": ""
  },
  {
   "id": "357",
   "bin": "357",
   "sec": "guest",
   "title": "Rescued by Christ",
   "items": [
    "misc rescued shirts"
   ],
   "loc": ""
  },
  {
   "id": "358",
   "bin": "358",
   "sec": "guest",
   "title": "heavenly heather hoodies tote 1",
   "items": [
    "heather maroon hoodies"
   ],
   "loc": ""
  },
  {
   "id": "359",
   "bin": "359",
   "sec": "guest",
   "title": "Rooting for Jesus",
   "items": [
    "rooted red t shirts k2c"
   ],
   "loc": ""
  },
  {
   "id": "360",
   "bin": "360",
   "sec": "guest",
   "title": "heavenly heather hoodies tote 2",
   "items": [
    "heather maroon hoodies"
   ],
   "loc": ""
  },
  {
   "id": "361",
   "bin": "361",
   "sec": "guest",
   "title": "Black Before Beauty Blessings hoodies",
   "items": [
    "black hoodies"
   ],
   "loc": ""
  },
  {
   "id": "362",
   "bin": "362",
   "sec": "guest",
   "title": "Hanger Hung Fun in Sun for the Son of God",
   "items": [
    "assorted merch on hangers",
    "Bubble wrap"
   ],
   "loc": ""
  },
  {
   "id": "363",
   "bin": "363",
   "sec": "guest",
   "title": "Krazy Kids Klub Krate",
   "note": "Kids club supplies",
   "items": [
    "2x market basket bags of small crosses bags many",
    "two chalk tubs",
    "grey bowl and 12 sponges",
    "bubbles",
    "5x single gallon ziplock bags",
    "bubble machine 2x",
    "stickers",
    "bouncy ball containers white with balls"
   ],
   "loc": ""
  },
  {
   "id": "364",
   "bin": "364",
   "sec": "guest",
   "title": "Rocks Box #2",
   "items": [
    "16x small rock white bags",
    "coat hanger 1x"
   ],
   "loc": ""
  },
  {
   "id": "365",
   "bin": "365",
   "sec": "guest",
   "title": "Cloth box",
   "items": [
    "2x table cloths black"
   ],
   "loc": ""
  },
  {
   "id": "366",
   "bin": "366",
   "sec": "guest",
   "title": "Health Blue Hoodies",
   "items": [
    "blue hoodies fireproof faith"
   ],
   "loc": ""
  },
  {
   "id": "367",
   "bin": "367",
   "sec": "guest",
   "title": "Tent Supplies",
   "items": [
    "18 metal tent stakes in black bag",
    "3 yellow ropes",
    "4 paracords",
    "4 single sides and 1 double side"
   ],
   "loc": ""
  },
  {
   "id": "368",
   "bin": "368",
   "sec": "guest",
   "title": "Miraculous Misc. Merch. Display",
   "items": [
    "coat hanger",
    "4 black tent strings",
    "3 table covers",
    "bag of merch hooks",
    "4 bungee cords",
    "prefilled displays",
    "bottom wheels to merch rack",
    "bag of badges"
   ],
   "loc": ""
  },
  {
   "id": "369",
   "bin": "369",
   "sec": "guest",
   "title": "Merch Display",
   "items": [
    "Too neat to touch & CDs"
   ],
   "loc": ""
  },
  {
   "id": "370",
   "bin": "370",
   "sec": "guest",
   "title": "Stupendous Sponsor Supplies",
   "items": [
    "Liz knows the scoop"
   ],
   "loc": ""
  },
  {
   "id": "371",
   "bin": "371",
   "sec": "guest",
   "title": "Hard Plastic Coolers",
   "qty": "4",
   "items": [],
   "loc": ""
  },
  {
   "id": "372",
   "bin": "372",
   "sec": "guest",
   "title": "Hand Truck",
   "qty": "1",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-foam-coolers",
   "sec": "guest",
   "kind": "loose",
   "title": "Foam Coolers",
   "qty": "6",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-water-bottles",
   "sec": "guest",
   "kind": "loose",
   "title": "water bottles",
   "qty": "50",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-cardboard-trash-bags",
   "sec": "guest",
   "kind": "loose",
   "title": "Cardboard trash bags",
   "qty": "10",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-black-4ft-tables",
   "sec": "guest",
   "kind": "loose",
   "title": "Black 4ft tables",
   "qty": "2",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-white-card-table",
   "sec": "guest",
   "kind": "loose",
   "title": "white card table",
   "qty": "1",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-black-6ft-table",
   "sec": "guest",
   "kind": "loose",
   "title": "black 6ft table",
   "qty": "4",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-10x10-tents",
   "sec": "guest",
   "kind": "loose",
   "title": "10x10 tents",
   "qty": "6",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-10x20-tents",
   "sec": "guest",
   "kind": "loose",
   "title": "10x20 tents",
   "qty": "2",
   "items": [],
   "loc": ""
  },
  {
   "id": "t2-tent-weight-bags",
   "sec": "guest",
   "kind": "loose",
   "title": "tent weight bags",
   "qty": "20",
   "items": [],
   "loc": ""
  }
 ]
};
