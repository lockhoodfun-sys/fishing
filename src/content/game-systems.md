# GoFish — Player Handbook

Everything below explains how GoFish actually works: what you do on the island, how the two currencies flow, exactly how a catch is decided, how gear changes your odds, and how gold turns into real value. Every number here is the number the game uses.

One rule underpins the whole design: the game resolves everything on its own side. Your device draws the boat, the rod and the splash, but it never decides what you caught, what it is worth or how much gold you hold. That is why the odds below can be published openly — nothing in them can be nudged from the outside.

---

## 1. The Island at a Glance

You arrive at a small fishing island with a starter rod, basic bait and a wooden dinghy. You cast, you wait for a bite, you hook the fish in time, and it lands in your bag. Fish sell for coins, coins buy better gear, better gear opens heavier and rarer species, and rarer species feed the quest chain, the leaderboard and — once a day — the gold event that is the only path to real, redeemable value.

The island runs a live clock and live weather. Both keep moving whether or not you are looking, and both change how fishing feels: how long you have to react, and how likely the rare stuff is to show up. Around the docks you will find the shops, the quest board, the global chat, the leaderboard and, during its daily window, the reward keeper who pays gold.

---

## 2. The Two Currencies

GoFish deliberately runs two currencies that never mix.

**Coins** are the soft currency. You earn them by selling fish and by claiming quest rewards, and you spend them on rods, bait and boats. Coins have no value outside the game and cannot be cashed out. They exist to pace your progression: the whole gear ladder is priced so that reaching the top means genuinely fishing your way there.

**Gold** is the hard currency. You cannot buy it, you cannot sell fish for it, and you cannot farm it freely. Gold comes only from the daily reward event, and only if you clear two separate gates — a character level requirement and a proven token-holding requirement. Gold is the one balance that can be withdrawn and paid out for real value, so everything around it is deliberately slower and stricter than the coin economy.

| | Coins | Gold |
|---|---|---|
| Earned from | Selling fish, quest rewards | Daily reward event only |
| Spent on | Rods, bait, boats | Withdrawal requests |
| Gated by | Your level (for purchases) | Level 5 and up, plus a proven holding tier |
| Redeemable | No | Yes |

### 2.1 Selling Fish

Selling is priced purely by mass and quality. Each species has a base price per kilogram, and each mutation multiplies it. A fish is therefore worth its weight times its species price times its mutation multiplier, rounded to the nearest coin.

That makes weight the dominant factor. A near-maximum Baby Tuna at 1,300 kg sells for roughly 28,600 coins, while an Ancient Leviathan at full size clears about 120,000 coins before any mutation bonus. The same species caught small can be worth a fraction of that, so a heavy roll matters as much as a rare one.

You can sell a single fish, every fish of one species at once, or empty the whole bag in one action.

### 2.2 Buying Gear

Every purchase checks three things together: the tier is not already yours, your level is high enough, and your coin balance covers the price. All three must pass in the same instant, so you can never end up paying twice or owning something you did not qualify for. Buying gear also advances any quest that asked for that exact purchase.

---

## 3. How a Catch Is Decided

When you cast, the game resolves the whole catch itself, in a fixed order.

First it checks your cast cooldown — casts are spaced 1.5 seconds apart, so no rapid-fire spamming. Then it reads the current weather and pulls that weather's rarity bonuses. Next it looks up the rod and bait you actually have equipped, falling back to the starter set if you have nothing equipped, and combines their luck bonuses: the two multiply together rather than simply adding, so a lucky rod paired with lucky bait is worth more than either alone.

Then the species pool is built. Only species whose minimum weight fits inside your rod's maximum catch weight are allowed to enter — anything heavier than your rod can handle is not merely hard to catch, it is completely absent from the roll. Every eligible species gets a weight based on its rarity, boosted by your luck (which applies to everything except common fish), your bait's rarity bonuses and the current weather's rarity bonuses. A single draw against those combined weights picks the species.

Once the species is known, the exact weight is rolled uniformly between that species' minimum and maximum, and a separate independent roll decides the mutation. Finally the fish is stored in your bag, your rarity counters and XP move, your level is recalculated, and any catch-based quest progress ticks over.

Monster fish are not a special case. The Ancient Leviathan sits in the same weighted pool as everything else, but its minimum weight of 1,200 kg means only a Mythic Rod, with its 1,500 kg cap, can ever pull it in. That is intentional: the single biggest payout in the game is reserved for players who actually completed the gear ladder, rather than being a flat lottery ticket every rod shares.

### 3.1 Species Catalog

| Species | Rarity | Weight range (kg) | Monster | Price per kg | Pool weight |
|---|---|---:|:---:|---:|---:|
| Clownfish | Common | 5 – 40 | No | 4 | 100 |
| Mackerel | Rare | 35 – 120 | No | 6 | 45 |
| Scad | Epic | 100 – 300 | No | 9 | 18 |
| Red Snapper | Legendary | 280 – 650 | No | 14 | 6 |
| Baby Tuna | Mythic | 600 – 1,300 | No | 22 | 2 |
| Ancient Leviathan | Mythic | 1,200 – 3,000 | Yes | 40 | 2 |

Pool weight is relative: with no luck bonuses at all, a common fish is fifty times more likely to appear than a mythic one. Luck bonuses lift everything except common, which is how better gear gradually reshapes the whole distribution instead of just adding a rare-fish chance on top.

### 3.2 Mutations

Every catch rolls for a mutation independently of its species. A mutation multiplies both the sell price and the XP gained, so a sparkling legendary is worth substantially more than a plain one in both money and progression.

| Mutation | Multiplier | Relative odds |
|---|---:|---:|
| Normal | ×1.0 | 55 |
| Big | ×1.2 | 15 |
| Dark | ×1.3 | 10 |
| Albino | ×1.4 | 7 |
| Sparkling | ×1.5 | 5 |

---

## 4. Experience and Levels

Levels gate everything you can buy, and the gold event itself. The curve is deliberately quadratic: each level costs more than the last, so early levels come quickly and the level 50 gear gates sit a long way out.

Reaching a level requires one hundred times the square of one less than that level in total experience — level 2 at 100, level 3 at 400, level 4 at 900, and so on.

| Level | Total XP required | XP earned inside that level |
|---:|---:|---:|
| 1 | 0 | 100 |
| 2 | 100 | 200 |
| 3 | 400 | 500 |
| 4 | 900 | 700 |
| 5 | 1,600 | 900 |
| 10 | 8,100 | 1,900 |
| 20 | 36,100 | 3,900 |

Experience comes from catches and quest rewards. A catch pays a base amount by rarity, multiplied by the mutation, and always at least 1.

| Rarity | Base XP |
|---|---:|
| Common | 10 |
| Rare | 25 |
| Epic | 60 |
| Legendary | 150 |
| Mythic | 400 |

---

## 5. Weather and the Bite Window

Weather is the game's risk-and-reward dial. Rough conditions cut the bite window — the time you have to react and hook a fish after it bites — but sharply raise the odds of the rarest species. Fishing a storm is harder and more rewarding; fishing a clear afternoon is relaxed and steady.

| Weather | Bite window | Rarity bonuses |
|---|---:|---|
| Clear | 1.6 s | none |
| Cloudy | 1.6 s | none |
| Foggy | 1.3 s | epic, legendary and mythic ×1.3 |
| Rain | 1.1 s | epic ×1.3, legendary and mythic ×1.5 |
| Storm | 0.9 s | legendary ×1.8, mythic ×2.5 |

The weather rerolls every four minutes from a weighted pool, so storms are rare enough to feel like an opportunity worth dropping everything for.

| Weather | Cycle weight |
|---|---:|
| Clear | 40 |
| Cloudy | 25 |
| Foggy | 15 |
| Rain | 12 |
| Storm | 8 |

---

## 6. Gear: Rods, Bait and Boats

There are three independent gear tracks with six tiers each. You can own every tier you have bought, but only one of each kind is equipped at a time. Buying needs coins and level; equipping only needs ownership, since the level requirement was already proven when you paid.

Rods are the most consequential purchase in the game, because the maximum catch weight decides which species can appear for you at all.

| Rod | Max catch weight | Luck | Reel speed | Price | Level |
|---|---:|---:|---:|---:|---:|
| Starter Rod | 10 kg | +0% | +0% | free | 1 |
| Uncommon Rod | 40 kg | +10% | +5% | 1,000 | 5 |
| Rare Rod | 100 kg | +25% | +12% | 10,000 | 10 |
| Epic Rod | 250 kg | +50% | +22% | 60,000 | 20 |
| Legendary Rod | 600 kg | +80% | +35% | 250,000 | 35 |
| Mythic Rod | 1,500 kg | +130% | +50% | 1,000,000 | 50 |

Bait is pure luck, and it stacks multiplicatively with your rod's luck.

| Bait | Luck | Price | Level |
|---|---:|---:|---:|
| Basic Bait | +0% | free | 1 |
| Uncommon Bait | +20% | 1,000 | 5 |
| Rare Bait | +50% | 15,000 | 10 |
| Epic Bait | +95% | 120,000 | 20 |
| Legendary Bait | +160% | 600,000 | 35 |
| Mythic Bait | +250% | 2,000,000 | 50 |

Boats change how fast you move around the island.

| Boat | Speed | Price | Level |
|---|---:|---:|---:|
| Wooden Dinghy | 100% | free | 1 |
| SS Minnow | 130% | 5,000 | 5 |
| Reef Runner | 160% | 40,000 | 10 |
| Bow Raider | 200% | 200,000 | 20 |
| Sea Marshal | 250% | 800,000 | 35 |
| Vex Yacht | 320% | 3,000,000 | 50 |

All three tracks share one level ladder — tier two at level 5, tier three at 10, tier four at 20, tier five at 35 and tier six at 50 — so your level always tells you exactly how far up every shop you can reach. Owning one complete maxed loadout costs roughly 8.1 million coins in total.

---

## 7. The Quest Chain

You work through ten quests in a fixed order, one at a time. Quests sit outside the level system entirely: they are a bonus track that rewards both coins and experience for playing naturally, and each one can demand several different things at once — catching, selling and buying gear all in the same quest. A quest becomes claimable only when every one of its requirements is fully met.

The chain is built so that finishing it means you have used essentially everything the game offers: every rarity, both sides of the market, and every non-starter tier across all three shops.

| # | Quest | What it asks | Coins | XP |
|---:|---|---|---:|---:|
| 1 | A Challenging Start | Catch 250 common, sell 100 common | 500 | 150 |
| 2 | The Angler's Gear | Catch 150 common, sell 50 common, buy the uncommon rod and bait | 1,200 | 400 |
| 3 | Rare Pursuit | Catch 100 common and 50 rare, sell 50 common and 20 rare | 2,500 | 800 |
| 4 | Breaking Into Epic | Catch 50 common and 25 epic, sell 30 rare, buy the rare rod | 5,000 | 1,500 |
| 5 | Seasoned Angler | Catch 80 rare and 15 epic, sell 40 epic, buy the rare bait | 9,000 | 2,500 |
| 6 | New Captain | Catch 40 epic and 5 legendary, buy the epic rod and the Reef Runner | 16,000 | 4,000 |
| 7 | A Legend in the Making | Catch 20 legendary, sell 60 epic, buy the epic bait and the Bow Raider | 30,000 | 7,000 |
| 8 | Conqueror of the Depths | Catch 60 epic, 10 legendary and 2 mythic, buy the legendary rod | 55,000 | 12,000 |
| 9 | On the Verge of Myth | Catch 15 legendary and 5 mythic, buy the legendary bait and the Sea Marshal | 90,000 | 18,000 |
| 10 | The True Mythic Angler | Catch 10 mythic, sell 5 legendary, buy the mythic rod, mythic bait and Vex Yacht | 150,000 | 30,000 |

Once the tenth quest is claimed the chain is finished for good and the board simply reports that there is nothing left to take.

---

## 8. Gold, Holding Tiers and Withdrawals

Gold is the bridge between playing and real value, so it is the most tightly controlled part of the game.

### 8.1 The Daily Reward Event

Once per day, at midnight UTC, the reward keeper appears with a two-hour claim window. You need to be at least level 5 to see them at all.

Each day's event asks for three randomized turn-in packages — a common, a rare and an epic amount, each drawn fresh within a fixed range — plus two fixed bonus turn-ins that can each be taken once per visit.

| Turn-in | Quantity | Pays |
|---|---|---:|
| Common package | 100 – 200 fish | part of the base bundle |
| Rare package | 40 – 100 fish | part of the base bundle |
| Epic package | 20 – 60 fish | part of the base bundle |
| Complete base bundle | all three above together | 1 gold |
| Legendary bonus | 5 legendary fish | 2 gold |
| Mythic bonus | 1 mythic fish | 3 gold |

The base bundle is all or nothing. The number of bundles you can hand over is limited by whichever of the three rarities you have the least of, so stockpiling only commons does nothing. Fish are always taken oldest first. The bonuses are separate single claims and only pay if you have the full amount required.

Every visit is also capped by your holding tier's per-visit gold limit. Base gold is trimmed to whatever room is left, and if there is not enough room remaining for a whole bonus bundle, that bonus is skipped for the day rather than paid partially.

### 8.2 Holding Tiers

Your gold limits depend on how much value you hold in the game's token — and, crucially, on how long you have held it. Your live balance is read against a live market price, and a tier is granted only if your value stayed at or above that tier's threshold for its entire required window, with enough recorded history to prove it.

This matters because instant balances are trivially faked: borrow a large amount briefly, or pass the same balance between wallets, and an instant check would hand out top-tier access to everyone. The continuous-holding requirement makes that pointless. A brand new wallet with a huge balance is worth nothing until the clock runs.

You will therefore see two numbers. The tier that actually governs your limits is the proven one. The other, shown for information only, tells you which tier your current balance would reach if you simply keep holding it — it never grants anything by itself.

| Tier | Value held | Gold per visit | Withdraw min | Withdraw max | Withdrawals per day | Must hold for |
|---|---:|---:|---:|---:|---:|---:|
| Tier 1 | $10 | 5 | 5 | 5 | 1 | 24 hours |
| Tier 2 | $100 | 15 | 5 | 15 | 1 | 24 hours |
| Tier 3 | $1,000 | 30 | 5 | 30 | 1 | 48 hours |
| Tier 4 | $2,000 | unlimited | unlimited | unlimited | 1 | 72 hours |

### 8.3 Withdrawing

Before you submit anything, the gold panel shows your current held value and the tier it resolves to, so you know your limits up front. When you do submit, the tier is resolved again independently — a claimed tier from your side is never trusted — the amount is checked against that tier's minimum and maximum, and your daily withdrawal count is checked. If everything passes, the gold leaves your balance immediately and the request enters the queue as pending.

From there a request can end in four ways. It can be approved and paid out, with the payout reference recorded against it. It can be rejected, which refunds your gold. You can cancel it yourself while it is still pending, which refunds you straight away without waiting for anyone. Or it can sit untouched for seven days, after which it expires automatically and refunds you.

Every single change to your gold balance — each claim, each locked withdrawal, each refund — is written to a permanent record that stores the amount, the reason and your resulting balance. Nothing about your gold can move without leaving a trail.

---

## 9. Social Features

The leaderboard shows the top fifty players and always shows your own rank as well, even when you are far outside that top fifty. You can sort it three ways: by experience and level, by coin balance, or by total fish caught.

Global chat is one shared room for everyone on the island. Messages run from 1 to 240 characters, with a two-second gap between your own messages, and the room keeps the most recent two hundred messages. Messages arrive live without refreshing. Your name and avatar are stored with each message as they were when you sent it, so old conversations stay readable even after someone renames themselves.

Your profile is tied to your wallet and is created automatically the first time you connect, with a generated angler name you can change. Usernames are 3 to 20 characters of letters, numbers and underscores and must be unique; display names can run to 40 characters. You can upload an avatar image up to 5 MB. Your bag holds your unsold catch, showing up to the 500 most recent fish.

---

## 10. Fairness and Safety

A short summary of the guarantees behind everything above.

Nothing about a catch is decided on your device. Species, weight and mutation are all rolled by the game, and your device cannot submit a result — it can only ask for a cast and receive the outcome. The one thing it does send, the current weather, is verified before use and quietly replaced with clear skies if it does not check out.

Access is proven by signing a message with your wallet rather than by a password. That signature stays valid for 30 minutes and is reverified on every meaningful action, which keeps the window for anyone replaying an intercepted signature very small.

Currency, gear ownership, quest progress and withdrawals are all applied as single indivisible operations, so an action either fully happens or does not happen at all — there is no state where coins were taken but the item never arrived. Gold has an additional permanent audit record for every movement, and withdrawal approvals are handled by an administrator who cannot process the same request twice.

Finally, the holding tiers exist specifically to stop wealth from being faked. Value has to be held continuously and verifiably before it unlocks anything, which is what keeps the gold economy tied to genuine long-term participation rather than to a momentary balance.
