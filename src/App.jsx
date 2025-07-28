import React, { useState, useEffect, useRef } from 'react';

// --- Helper Functions & Constants ---
const normalizeJp = (str) => {
  if (!str) return '';
  return str.replace(/[\u30a1-\u30f6]/g, (match) => {
    const chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  }).toLowerCase().trim();
};

const unitOptions = ['g', 'kg', '個', '本', 'ml', 'L', '枚', 'パック', '束'];

const getCurrentSeason = () => {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5) return '春';
    if (month >= 6 && month <= 8) return '夏';
    if (month >= 9 && month <= 11) return '秋';
    return '冬';
};

const getMealTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return '朝';
    if (hour >= 11 && hour < 16) return '昼';
    return '夜';
};


// --- Main App Component ---
export default function App() {
    // --- State Management ---
    const [ingredients, setIngredients] = useState(() => JSON.parse(localStorage.getItem('recipeApp-ingredients')) || []);
    const [shoppingList, setShoppingList] = useState(() => JSON.parse(localStorage.getItem('recipeApp-shoppingList')) || []);
    const [allergies, setAllergies] = useState(() => JSON.parse(localStorage.getItem('recipeApp-allergies')) || []);
    const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem('recipeApp-history')) || []);
    const [bookmarks, setBookmarks] = useState(() => JSON.parse(localStorage.getItem('recipeApp-bookmarks')) || []);
    const [userProfile, setUserProfile] = useState(() => JSON.parse(localStorage.getItem('recipeApp-userProfile')) || { gender: 'male', age: '30-49' });
    const [userPreferenceSummary, setUserPreferenceSummary] = useState(() => localStorage.getItem('recipeApp-preferenceSummary') || '');
    const [preferenceSummaryLog, setPreferenceSummaryLog] = useState(() => JSON.parse(localStorage.getItem('recipeApp-preferenceSummaryLog')) || []);


    const [newIngredient, setNewIngredient] = useState({ name: '', quantity: '', unit: 'g', customUnit: '' });
    const [newAllergy, setNewAllergy] = useState('');
    
    const [recipe, setRecipe] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [isReasonLoading, setIsReasonLoading] = useState(false);
    const [error, setError] = useState(null);
    
    const [tags, setTags] = useState({ mealType: '', cuisine: '', cookingMethod: '', time: '' });
    const [servings, setServings] = useState(2);
    const [customRequest, setCustomRequest] = useState('');
    const [ignoreFeedback, setIgnoreFeedback] = useState(false);
    const [selectedBookmark, setSelectedBookmark] = useState(null);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
    const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
    const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
    
    const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
    const [dataToImport, setDataToImport] = useState(null);
    const fileInputRef = useRef(null);

    const [lastMovedShoppingItem, setLastMovedShoppingItem] = useState(null);
    const undoTimeoutRef = useRef(null);
    const [defaultEditingId, setDefaultEditingId] = useState(null);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });


    // --- Data Persistence using localStorage ---
    useEffect(() => { localStorage.setItem('recipeApp-ingredients', JSON.stringify(ingredients)); }, [ingredients]);
    useEffect(() => { localStorage.setItem('recipeApp-shoppingList', JSON.stringify(shoppingList)); }, [shoppingList]);
    useEffect(() => { localStorage.setItem('recipeApp-allergies', JSON.stringify(allergies)); }, [allergies]);
    useEffect(() => {
        const sortedHistory = [...history].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        localStorage.setItem('recipeApp-history', JSON.stringify(sortedHistory));
    }, [history]);
    useEffect(() => {
        const sortedBookmarks = [...bookmarks].sort((a, b) => new Date(b.bookmarkedAt) - new Date(a.bookmarkedAt));
        localStorage.setItem('recipeApp-bookmarks', JSON.stringify(sortedBookmarks));
    }, [bookmarks]);
    useEffect(() => { localStorage.setItem('recipeApp-userProfile', JSON.stringify(userProfile)); }, [userProfile]);
    useEffect(() => { localStorage.setItem('recipeApp-preferenceSummary', userPreferenceSummary); }, [userPreferenceSummary]);
    useEffect(() => { localStorage.setItem('recipeApp-preferenceSummaryLog', JSON.stringify(preferenceSummaryLog)); }, [preferenceSummaryLog]);

    const generateSuggestionReason = async (currentRecipe) => {
        let reasonPrompt = `以下のレシピについて、提案理由を生成してください。\n\n`;
        if (!ignoreFeedback) {
            const season = getCurrentSeason();
            const timeOfDay = getMealTimeOfDay();
            reasonPrompt += `■ 考慮した背景\n- 時期: ${season}の${timeOfDay}\n`;
            if (userPreferenceSummary) {
                reasonPrompt += `- ユーザーの好み: ${userPreferenceSummary}\n`;
            }
            const recentNutrients = history.filter(h => h.nutritionValues).slice(0, 3);
            if (recentNutrients.length > 0) {
                 const avgNutrients = recentNutrients.reduce((acc, curr) => {
                    Object.keys(curr.nutritionValues).forEach(key => {
                        acc[key] = (acc[key] || 0) + curr.nutritionValues[key];
                    });
                    return acc;
                }, {});
                Object.keys(avgNutrients).forEach(key => {
                    avgNutrients[key] /= recentNutrients.length;
                });
                reasonPrompt += `- 最近の食事の栄養傾向: ${JSON.stringify(avgNutrients, null, 2)}\n`;
            }
        } else {
             reasonPrompt += `■ 考慮した背景\n- 現在は気分転換モードです。\n`;
        }
        reasonPrompt += `\n■ 提案されたレシピ\n- ${currentRecipe.recipeName}: ${currentRecipe.description}\n\n# 指示\n・栄養士の視点から、簡潔かつ論理的に記述する。\n・挨拶や自己紹介は絶対に含めない。\n・太字（**）は使用しない。\n・全体の文字数は50～100文字程度に収める。`;

        try {
            const payload = { contents: [{ role: "user", parts: [{ text: reasonPrompt }] }] };
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`API error: ${response.statusText}`);
            const result = await response.json();
            if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                setRecipe(prev => prev ? { ...prev, suggestionReason: result.candidates[0].content.parts[0].text } : null);
            }
        } catch (err) {
            console.error("Failed to generate suggestion reason:", err);
        } finally {
            setIsReasonLoading(false);
        }
    };
    
    useEffect(() => {
        if (recipe && !recipe.suggestionReason && !isLoading) {
            setIsReasonLoading(true);
            generateSuggestionReason(recipe);
        }
    }, [recipe, isLoading]);


    // --- Handler Functions ---
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => {
            setToast({ show: false, message: '', type: 'success' });
        }, 3000);
    };

    const handleIngredientChange = (e) => {
        const { name, value } = e.target;
        setNewIngredient(prev => ({ ...prev, [name]: value, ...(name === 'unit' && value !== 'その他' && { customUnit: '' }) }));
    };

    const addIngredient = (e) => {
        e.preventDefault();
        if (!newIngredient.name.trim() || !newIngredient.quantity) return;
        const unitToSave = newIngredient.unit === 'その他' ? newIngredient.customUnit.trim() : newIngredient.unit;
        if (!unitToSave) { setError("「その他」を選択した場合は単位を入力してください。"); return; }
        const newIng = { id: crypto.randomUUID(), name: newIngredient.name.trim(), quantity: parseFloat(newIngredient.quantity), unit: unitToSave, mustUse: false };
        setIngredients(prev => [...prev, newIng]);
        setNewIngredient({ name: '', quantity: '', unit: 'g', customUnit: '' });
    };

    const updateIngredient = (id, updatedData) => setIngredients(prev => prev.map(ing => ing.id === id ? { ...ing, ...updatedData } : ing));
    const deleteIngredient = (id) => setIngredients(prev => prev.filter(ing => ing.id !== id));
    
    const addAllergy = (e) => {
        e.preventDefault();
        if (!newAllergy.trim()) return;
        setAllergies(prev => [...prev, { id: crypto.randomUUID(), name: newAllergy.trim() }]);
        setNewAllergy('');
    };

    const deleteAllergy = (id) => setAllergies(prev => prev.filter(a => a.id !== id));
    const handleTagChange = (e) => setTags(prev => ({ ...prev, [e.target.name]: e.target.value }));
    
    const generateRecipe = async (rejectedRecipe = null) => {
        if (ingredients.length === 0 && !customRequest.trim()) {
            setError("食材が登録されていません。自由リクエストに「トマトパスタ」など、作りたい料理を入力して提案を開始してください。");
            return;
        }
        setIsLoading(true); setError(null); setRecipe(null);
        
        let prompt = `あなたはユーザーの専属栄養士兼シェフです。以下の条件を厳密に守り、素晴らしいレシピを1つ提案してください。\n\n`;
        prompt += `■ 基本条件\n・${servings}人前のレシピとしてください。\n`;
        const allergyList = allergies.map(a => a.name).join(', ');
        if(allergyList) prompt += `・アレルギー食材 (${allergyList}) は絶対に使用しないでください。\n`;

        if (ingredients.length > 0) {
            const mustUseIngredients = ingredients.filter(i => i.mustUse);
            const otherIngredients = ingredients.filter(i => !i.mustUse);
            if (mustUseIngredients.length > 0) prompt += `\n■【最重要】必ず使い切る食材\n以下の食材は、**必ず全て使い切る**ようにレシピを組み立ててください：\n[${mustUseIngredients.map(i => `${i.name} (${i.quantity}${i.unit})`).join(', ')}]\n`;
            if (otherIngredients.length > 0) prompt += `\n■ その他の手持ち食材\n以下の食材は、必要に応じて使ってください：\n[${otherIngredients.map(i => `${i.name} (${i.quantity}${i.unit})`).join(', ')}]\n`;
        } else {
            prompt += `\n■【重要】手持ちの食材はありません。\n一般的な食材を使って、以下のリクエストに基づいたレシピを自由に提案してください。\n`;
        }

        if (!ignoreFeedback) {
            const season = getCurrentSeason();
            const timeOfDay = getMealTimeOfDay();
            prompt += `・現在は${season}の${timeOfDay}です。この時期や時間帯に合ったレシピを考慮してください。\n`;

            if (userPreferenceSummary) {
                prompt += `\n■ 私の好みの要約\n${userPreferenceSummary}\nこの要約を最優先で考慮してください。\n`;
            }

            const recentNutrients = history.filter(h => h.nutritionValues).slice(0, 3);
            if (recentNutrients.length > 0) {
                const avgNutrients = recentNutrients.reduce((acc, curr) => {
                    Object.keys(curr.nutritionValues).forEach(key => {
                        acc[key] = (acc[key] || 0) + curr.nutritionValues[key];
                    });
                    return acc;
                }, {});
                Object.keys(avgNutrients).forEach(key => {
                    avgNutrients[key] /= recentNutrients.length;
                });
                prompt += `\n■ 栄養バランスの考慮\n最近の食事の平均栄養素は以下の通りです（1食あたり）：\n${JSON.stringify(avgNutrients, null, 2)}\nこれらの食事内容を考慮し、栄養バランスが取れるようなレシピを提案してください。\n`;
            }
        }

        const tagInfo = Object.entries(tags).map(([k, v]) => v ? `${{mealType: '種類', cuisine: 'ジャンル', cookingMethod: '調理法', time: '調理時間'}[k]}: ${v}${k === 'time' ? '分以内' : ''}` : null).filter(Boolean);
        if (tagInfo.length > 0) prompt += `\n■ その他の希望条件\n${tagInfo.join(', ')}\n`;
        if (customRequest.trim()) prompt += `\n■ 自由記述リクエスト\n「${customRequest.trim()}」\n`;
        if (rejectedRecipe) prompt += `\n■【最重要】除外するレシピ\nユーザーは直前に提案された以下のレシピを好みませんでした。これとは全く異なるスタイルの新しいレシピを提案してください。\n- レシピ名: ${rejectedRecipe.recipeName}\n- 説明: ${rejectedRecipe.description}\n`;

        prompt += `\n■ 指示\n・自然で美味しいレシピを考えてください。\n・**nutritionValues**: レシピの栄養価を**1人前あたり**で計算してください。\n・提案したレシピが「主菜」「副菜」「汁物」「デザート」のどれに分類されるか、必ず "mealType" フィールドに含めてください。\n`;
        
        if (!tags.mealType || tags.mealType === '主菜') {
             prompt += `・**主食に関する注意**: 提案するレシピが「主菜」の場合、ユーザーは別途白米などの主食（約250kcal, 炭水化物55g程度）を摂ることを前提として、おかず単体での栄養バランスを最適化してください。炭水化物が不足しているように見えても問題ありません。\n`;
        }
        
        prompt += `・JSONレスポンスの「usedIngredients」フィールドには、上記の「手持ちの食材リスト」から使用した食材を、**名前の表記を一切変えずにそのまま**記載してください。\n・**最重要**: 食材の分量を指定する際、以下の2種類の値を必ず含めてください。\n  1. **displayText**: 調理時に分かりやすい表記（例：「大さじ1」、「チューブ5cm」、「ひとつまみ」など）。\n  2. **baseQuantity** と **baseUnit**: 「displayText」の量が、「手持ちの食材リスト」の単位でどれだけに相当するかを計算した正確な値。'baseUnit'は必ずリストの単位と一致させてください。\n\n以上の条件をすべて満たしたレシピを、以下のJSON形式で日本語で回答してください。`;
        
        const nutritionSchema = { type: "OBJECT", properties: { calories: { type: "NUMBER" }, protein: { type: "NUMBER" }, fat: { type: "NUMBER" }, carbs: { type: "NUMBER" }, salt: { type: "NUMBER" } } };
        const ingredientSchema = { type: "OBJECT", properties: { name: { type: "STRING" }, displayText: { type: "STRING" }, baseQuantity: { type: "NUMBER" }, baseUnit: { type: "STRING" } }, required: ["name", "displayText", "baseQuantity", "baseUnit"] };
        const schema = { type: "OBJECT", properties: { recipeName: { type: "STRING" }, description: { type: "STRING" }, mealType: { type: "STRING", description: "レシピの種類（主菜, 副菜, 汁物, デザートのいずれか）" }, servings: { type: "NUMBER" }, timeRequired: { type: "NUMBER" }, usedIngredients: { type: "ARRAY", items: ingredientSchema }, additionalIngredients: { type: "ARRAY", items: ingredientSchema }, instructions: { type: "ARRAY", items: { type: "STRING" } }, nutritionValues: nutritionSchema }, required: ["recipeName", "description", "mealType", "servings", "timeRequired", "usedIngredients", "additionalIngredients", "instructions", "nutritionValues"] };
        try {
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } };
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`API error: ${response.statusText}`);
            const result = await response.json();
            if (result.candidates?.[0]?.content?.parts?.[0]) {
                const parsedRecipe = JSON.parse(result.candidates[0].content.parts[0].text);
                setRecipe({ ...parsedRecipe, customRequestUsed: customRequest.trim() });
            } else {
                setError(result.promptFeedback?.blockReason ? `レシピ生成がブロックされました: ${result.promptFeedback.blockReason.reason}` : "レシピの取得に失敗しました。");
            }
        } catch (err) { setError("レシピの生成中にエラーが発生しました。"); } finally { setIsLoading(false); }
    };
    
    const updatePreferenceSummary = async (currentHistory) => {
        const ratedHistory = (currentHistory || history).filter(item => item.feedback);
        if (ratedHistory.length === 0) {
            showToast("評価済みの履歴がありません。", "info");
            return;
        }
        setIsSummarizing(true);
        const goodRecipes = ratedHistory.filter(i => i.feedback === 'good' || i.feedback === 'great').map(i => i.recipeName).join(', ') || 'なし';
        const badRecipes = ratedHistory.filter(i => i.feedback === 'bad').map(i => i.recipeName).join(', ') || 'なし';
        const successfulRequests = ratedHistory
            .filter(i => (i.feedback === 'good' || i.feedback === 'great') && i.customRequestUsed)
            .map(i => `「${i.customRequestUsed}」`)
            .join(', ');

        const prompt = `ユーザーのレシピ評価履歴と、成功した自由リクエストを分析し、その人の食の好みを簡潔に要約してください。味付け、食材、調理法などの傾向を抽出し、箇条書きではなく、自然な文章で記述してください。\n\n# 評価履歴\n- 好んだレシピ: [${goodRecipes}]\n- 好まなかったレシピ: [${badRecipes}]\n\n# 成功した自由リクエスト\n[${successfulRequests || 'なし'}]\n\n# 出力例\n- 鶏肉や豚肉を使った、甘辛い味付けの和食や中華料理を好む傾向があります。特に「子供向け」や「しょっぱめ」といったリクエストが成功していることから、はっきりとした味付けを求めているようです。一方で、魚介類や酸味の強い料理はあまり好まないようです。`;

        try {
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`API error: ${response.statusText}`);
            const result = await response.json();
            if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                const newSummary = result.candidates[0].content.parts[0].text;
                setUserPreferenceSummary(newSummary);
                setPreferenceSummaryLog(prev => [{ date: new Date().toISOString(), summary: newSummary }, ...prev]);
                showToast("あなたの好みを学習しました！", "success");
            } else {
                throw new Error("要約の取得に失敗しました。");
            }
        } catch (err) {
            showToast("好みの学習中にエラーが発生しました。", "error");
        } finally {
            setIsSummarizing(false);
        }
    };

    const makeRecipe = (recipeToMake) => {
        let missingIngredients = [];
        let updatedIngredients = [...ingredients];
        [...(recipeToMake.usedIngredients || []), ...(recipeToMake.additionalIngredients || [])].forEach(used => {
            const ingIndex = updatedIngredients.findIndex(i => normalizeJp(i.name) === normalizeJp(used.name));
            if (ingIndex > -1) {
                const dbIng = updatedIngredients[ingIndex];
                if (normalizeJp(dbIng.unit) === normalizeJp(used.baseUnit) && dbIng.quantity >= used.baseQuantity) {
                    updatedIngredients[ingIndex] = { ...dbIng, quantity: dbIng.quantity - used.baseQuantity };
                } else { missingIngredients.push(used.name); }
            }
        });
        if (missingIngredients.length > 0) { setError(`材料が足りません: ${missingIngredients.join(', ')}`); return; }
        setIngredients(updatedIngredients.filter(ing => ing.quantity > 0.001));
        const newHistoryItem = { id: crypto.randomUUID(), ...recipeToMake, createdAt: new Date().toISOString(), feedback: null };
        setHistory(prev => [newHistoryItem, ...prev]);
        if (recipe && recipe.recipeName === recipeToMake.recipeName) { setRecipe(null); }
    };

    const rateRecipe = (recipeToRate, feedback) => {
        let newHistory = [];
        setHistory(prevHistory => {
            const existingHistoryItemIndex = prevHistory.findIndex(item => item.recipeName === recipeToRate.recipeName);
    
            if (existingHistoryItemIndex > -1) {
                const updatedHistory = [...prevHistory];
                const existingItem = updatedHistory[existingHistoryItemIndex];
                updatedHistory[existingHistoryItemIndex] = { ...existingItem, feedback: existingItem.feedback === feedback ? null : feedback };
                newHistory = updatedHistory;
                return updatedHistory;
            } else {
                const newHistoryItem = {
                    ...recipeToRate,
                    id: crypto.randomUUID(),
                    createdAt: new Date().toISOString(),
                    feedback: feedback,
                };
                newHistory = [newHistoryItem, ...prevHistory];
                return newHistory;
            }
        });

        setTimeout(() => {
             const ratedCount = newHistory.filter(item => item.feedback).length;
             if (ratedCount > 0 && ratedCount % 5 === 0) {
                showToast(`${ratedCount}回目の評価ありがとうございます！好みの自動学習を開始します。`, 'info');
                updatePreferenceSummary(newHistory);
             }
        }, 100);
    };

    const handleBookmark = (recipeToBookmark) => {
        if (!recipeToBookmark || bookmarks.some(bm => bm.recipeName === recipeToBookmark.recipeName)) { setError("このレシピは既にブックマークされています。"); return; }
        setBookmarks(prev => [{ id: crypto.randomUUID(), ...recipeToBookmark, bookmarkedAt: new Date().toISOString() }, ...prev]);
    };
    const deleteBookmark = (id) => setBookmarks(prev => prev.filter(bm => bm.id !== id));
    const deleteHistory = (id) => setHistory(prev => prev.filter(h => h.id !== id));

    const handleAddToShoppingList = (recipeToAdd) => {
        const allRecipeIngs = [...(recipeToAdd.usedIngredients || []), ...(recipeToAdd.additionalIngredients || [])];

        const neededItems = allRecipeIngs.filter(reqIng => {
            const stockIng = ingredients.find(ing => normalizeJp(ing.name) === normalizeJp(reqIng.name));
            if (!stockIng) return true;
            if (normalizeJp(stockIng.unit) === normalizeJp(reqIng.baseUnit)) {
                if (stockIng.quantity < reqIng.baseQuantity) return true;
            }
            return false;
        });

        const newItemsForShoppingList = neededItems
            .filter(needed => !shoppingList.some(shopItem => normalizeJp(shopItem.name) === normalizeJp(needed.name)))
            .map(needed => ({ id: crypto.randomUUID(), name: needed.name }));

        if (newItemsForShoppingList.length > 0) {
            setShoppingList(prev => [...prev, ...newItemsForShoppingList]);
            showToast('買い物リストに追加しました！', 'success');
        } else {
            showToast('追加するアイテムはありませんでした', 'info');
        }
    };

    const moveFromShoppingListToIngredients = (itemToMove) => {
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);

        const newIng = { id: crypto.randomUUID(), name: itemToMove.name, quantity: 1, unit: '個', mustUse: false };
        
        setIngredients(prev => [...prev, newIng]);
        setShoppingList(prev => prev.filter(item => item.id !== itemToMove.id));
        setDefaultEditingId(newIng.id);
        
        setLastMovedShoppingItem({ shoppingListItem: itemToMove, ingredientItem: newIng });

        undoTimeoutRef.current = setTimeout(() => {
            setLastMovedShoppingItem(null);
        }, 5000);
    };
    
    const handleUndoShoppingListMove = () => {
        if (!lastMovedShoppingItem) return;
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);

        setIngredients(prev => prev.filter(i => i.id !== lastMovedShoppingItem.ingredientItem.id));
        setShoppingList(prev => [lastMovedShoppingItem.shoppingListItem, ...prev]);
        
        setLastMovedShoppingItem(null);
    };

    const deleteShoppingListItem = (id) => {
        setShoppingList(prev => prev.filter(item => item.id !== id));
    };


    const handleBackup = () => {
        try {
            const backupData = { ingredients, shoppingList, allergies, history, bookmarks, userProfile, userPreferenceSummary, preferenceSummaryLog };
            const jsonString = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ai-recipe-backup-${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) { setError("バックアップファイルの作成に失敗しました。"); }
    };
    
    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsedData = JSON.parse(e.target.result);
                if (Array.isArray(parsedData.ingredients) && Array.isArray(parsedData.allergies) && Array.isArray(parsedData.history) && Array.isArray(parsedData.bookmarks)) {
                    setDataToImport(parsedData);
                    setIsImportConfirmOpen(true);
                } else {
                    setError("無効なバックアップファイルです。ファイルの形式が正しくありません。");
                }
            } catch (err) {
                setError("バックアップファイルの読み込みに失敗しました。JSON形式ではありません。");
            }
        };
        reader.onerror = () => setError("ファイルの読み込み中にエラーが発生しました。");
        reader.readAsText(file);
        event.target.value = null;
    };

    const handleImportConfirm = () => {
        if (!dataToImport) return;
        setIngredients(dataToImport.ingredients || []);
        setShoppingList(dataToImport.shoppingList || []);
        setAllergies(dataToImport.allergies || []);
        setHistory(dataToImport.history || []);
        setBookmarks(dataToImport.bookmarks || []);
        setUserProfile(dataToImport.userProfile || { gender: 'male', age: '30-49' });
        setUserPreferenceSummary(dataToImport.userPreferenceSummary || '');
        setPreferenceSummaryLog(dataToImport.preferenceSummaryLog || []);
        setDataToImport(null);
        setIsImportConfirmOpen(false);
        setError(null);
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
            <header className="bg-white shadow-sm p-4 sticky top-0 z-20 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
                    <h1 className="text-2xl font-bold text-gray-800">AIレシピさん</h1>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsGuideModalOpen(true)} className="btn-outline-secondary text-sm">使い方ガイド</button>
                </div>
            </header>
            <div className="container mx-auto p-4 md:p-8">
                <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <IngredientForm newIngredient={newIngredient} onAdd={addIngredient} onChange={handleIngredientChange} />
                        <ShoppingList shoppingList={shoppingList} onMove={moveFromShoppingListToIngredients} onDelete={deleteShoppingListItem} />
                        {lastMovedShoppingItem && (
                            <div className="bg-gray-700 text-white p-3 rounded-lg flex justify-between items-center animate-fade-in">
                                <span>「{lastMovedShoppingItem.shoppingListItem.name}」を購入済みにしました。</span>
                                <button onClick={handleUndoShoppingListMove} className="font-bold underline hover:text-gray-300">取り消す</button>
                            </div>
                        )}
                        <IngredientList ingredients={ingredients} onDelete={deleteIngredient} onUpdate={updateIngredient} defaultEditingId={defaultEditingId} onEditDone={() => setDefaultEditingId(null)} />
                    </div>
                    <div className="space-y-6">
                        <RecipeGenerator {...{tags, onTagChange: handleTagChange, onGenerate: generateRecipe, isLoading, hasIngredients: ingredients.length > 0, ignoreFeedback, setIgnoreFeedback, servings, setServings, customRequest, setCustomRequest}} />
                        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg" role="alert">{error}</div>}
                        <ProgressIndicator isActive={isLoading || isSummarizing} label={isSummarizing ? "好みを学習中..." : "レシピ提案中"} />
                        {recipe && !isLoading && <RecipeDisplay {...{recipe, userProfile, ingredients, allergies, history, onMake: makeRecipe, onBookmark: handleBookmark, onRegenerate: () => generateRecipe(recipe), onAddToShoppingList: handleAddToShoppingList, onRate: rateRecipe, onUpdateRecipe: setRecipe, isReasonLoading}} />}
                    </div>
                </main>
                <div className="mt-8 space-y-6">
                    <HistoryList history={history} onFeedback={rateRecipe} onSelect={setSelectedHistoryItem} />
                    <CollapsibleBookmarkList bookmarks={bookmarks} onDelete={deleteBookmark} onSelect={setSelectedBookmark} isOpen={isBookmarksOpen} setIsOpen={setIsBookmarksOpen} />
                    <PreferenceLearner onSummarize={() => updatePreferenceSummary()} isSummarizing={isSummarizing} userPreferenceSummary={userPreferenceSummary} preferenceSummaryLog={preferenceSummaryLog} />
                </div>
            </div>
            <footer className="mt-8 pt-8 pb-16 bg-gray-100 border-t">
                <div className="container mx-auto px-4 md:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <AllergyForm newAllergy={newAllergy} onAdd={addAllergy} onChange={(e) => setNewAllergy(e.target.value)} />
                        <AllergyList allergies={allergies} onDelete={deleteAllergy} />
                    </div>
                    <UserProfileSettings profile={userProfile} onProfileChange={setUserProfile} />
                    <DataManagement onBackup={handleBackup} onImportClick={() => fileInputRef.current.click()} />
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".json" className="hidden" />
                </div>
            </footer>
            {selectedBookmark && <BookmarkDetailModal recipe={selectedBookmark} userProfile={userProfile} ingredients={ingredients} allergies={allergies} history={history} onClose={() => setSelectedBookmark(null)} onDelete={deleteBookmark} onMake={makeRecipe} onRate={rateRecipe} onAddToShoppingList={handleAddToShoppingList} />}
            {selectedHistoryItem && <HistoryDetailModal recipe={selectedHistoryItem} userProfile={userProfile} ingredients={ingredients} allergies={allergies} history={history} onClose={() => setSelectedHistoryItem(null)} onDelete={deleteHistory} onBookmark={handleBookmark} onAddToShoppingList={handleAddToShoppingList} />}
            {isGuideModalOpen && <GuideModal onClose={() => setIsGuideModalOpen(false)} />}
            {isImportConfirmOpen && <ImportConfirmModal onConfirm={handleImportConfirm} onClose={() => setIsImportConfirmOpen(false)} />}
            <Toast message={toast.message} type={toast.type} isVisible={toast.show} onClose={() => setToast({ ...toast, show: false })} />
        </div>
    );
}

// --- Sub-components ---
const Toast = ({ message, type, isVisible, onClose }) => {
    if (!isVisible) return null;

    const baseStyle = "fixed bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg text-white font-semibold transition-all duration-300 z-50";
    const typeStyle = {
        success: "bg-green-600",
        info: "bg-blue-600",
        error: "bg-red-600",
    };
    const visibilityStyle = isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5";

    return (
        <div className={`${baseStyle} ${typeStyle[type]} ${visibilityStyle}`}>
            {message}
        </div>
    );
};
const IngredientForm = ({ newIngredient, onAdd, onChange }) => ( <div className="bg-white p-6 rounded-xl shadow-lg"> <h2 className="text-2xl font-semibold mb-4 text-gray-700">食材の登録</h2> <form onSubmit={onAdd} className="space-y-4"> <div> <label htmlFor="name" className="block text-sm font-medium text-gray-600">食材名</label> <input type="text" id="name" name="name" value={newIngredient.name} onChange={onChange} placeholder="例: じゃがいも" required className="mt-1 block w-full input-style" /> </div> <div className="flex items-end gap-2"> <div className="flex-grow"> <label htmlFor="quantity" className="block text-sm font-medium text-gray-600">量</label> <input type="number" id="quantity" name="quantity" value={newIngredient.quantity} onChange={onChange} placeholder="例: 3" required min="0.1" step="any" className="mt-1 block w-full input-style" /> </div> <div> <label htmlFor="unit" className="block text-sm font-medium text-gray-600">単位</label> <select id="unit" name="unit" value={newIngredient.unit} onChange={onChange} className="mt-1 block w-full input-style-select"> {unitOptions.map(u => <option key={u} value={u}>{u}</option>)} <option value="その他">その他...</option> </select> </div> </div> {newIngredient.unit === 'その他' && ( <div> <label htmlFor="customUnit" className="block text-sm font-medium text-gray-600">カスタム単位</label> <input type="text" id="customUnit" name="customUnit" value={newIngredient.customUnit} onChange={onChange} placeholder="例: 丁、房" required className="mt-1 block w-full input-style" /> </div> )} <button type="submit" className="w-full btn-primary">食材を追加</button> </form> </div> );
const ShoppingList = ({ shoppingList, onMove, onDelete }) => {
    if (shoppingList.length === 0) return null;
    return (
        <div className="bg-white p-6 rounded-xl shadow-lg">
            <h2 className="text-2xl font-semibold mb-4 text-yellow-600">買い物リスト</h2>
            <ul className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {shoppingList.map(item => (
                    <li key={item.id} className="flex justify-between items-center bg-yellow-50 p-3 rounded-lg">
                        <div className="flex items-center flex-grow">
                            <input
                                type="checkbox"
                                id={`shopping-${item.id}`}
                                className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                                onChange={() => onMove(item)}
                                title="食材リストに追加する"
                            />
                            <label htmlFor={`shopping-${item.id}`} className="ml-3 text-gray-800 cursor-pointer">{item.name}</label>
                        </div>
                        <button onClick={() => onDelete(item.id)} className="text-red-500 hover:text-red-700 flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};
const IngredientList = ({ ingredients, onDelete, onUpdate, defaultEditingId, onEditDone }) => {
    const [editingId, setEditingId] = useState(null);
    const [editingData, setEditingData] = useState({ name: '', quantity: '', unit: 'g', customUnit: '' });

    const handleEdit = (ingredient) => {
        setEditingId(ingredient.id);
        const isCustom = !unitOptions.includes(ingredient.unit);
        setEditingData({ name: ingredient.name, quantity: ingredient.quantity, unit: isCustom ? 'その他' : ingredient.unit, customUnit: isCustom ? ingredient.unit : '' });
    };

    useEffect(() => {
        if (defaultEditingId) {
            const itemToEdit = ingredients.find(i => i.id === defaultEditingId);
            if (itemToEdit) {
                handleEdit(itemToEdit);
                onEditDone();
            }
        }
    }, [defaultEditingId, ingredients, onEditDone]);

    const handleCancel = () => {
        setEditingId(null);
        setEditingData({ name: '', quantity: '', unit: 'g', customUnit: '' });
    };

    const handleSave = (id) => {
        const unitToSave = editingData.unit === 'その他' ? editingData.customUnit.trim() : editingData.unit;
        if (!unitToSave) { return; }
        onUpdate(id, { name: editingData.name, quantity: parseFloat(editingData.quantity), unit: unitToSave });
        handleCancel();
    };

    const handleToggleMustUse = (id, currentStatus) => onUpdate(id, { mustUse: !currentStatus });

    return ( <div className="bg-white p-6 rounded-xl shadow-lg"> <h2 className="text-2xl font-semibold mb-4 text-gray-700">現在の食材リスト</h2> {ingredients.length > 0 ? ( <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">{ingredients.map(ing => ( <li key={ing.id} className="bg-gray-50 p-3 rounded-lg"> {editingId === ing.id ? ( <div className="flex-grow space-y-2"> <div className="flex gap-2"> <input type="text" value={editingData.name} onChange={(e) => setEditingData({...editingData, name: e.target.value})} className="input-style w-full" /> <input type="number" value={editingData.quantity} onChange={(e) => setEditingData({...editingData, quantity: e.target.value})} className="input-style w-20" /> </div> <div className="flex gap-2"> <select value={editingData.unit} onChange={(e) => setEditingData({...editingData, unit: e.target.value})} className="input-style-select w-full"> {unitOptions.map(u => <option key={u} value={u}>{u}</option>)} <option value="その他">その他...</option> </select> {editingData.unit === 'その他' && <input type="text" value={editingData.customUnit} onChange={(e) => setEditingData({...editingData, customUnit: e.target.value})} className="input-style w-full" />} </div> <div className="flex gap-2"> <button onClick={() => handleSave(ing.id)} className="btn-primary-sm">保存</button> <button onClick={handleCancel} className="btn-secondary-sm">中止</button> </div> </div> ) : ( <div className="flex justify-between items-center w-full"> <button onClick={() => handleToggleMustUse(ing.id, ing.mustUse)} title="この食材を必ず使い切る" className={`mr-2 text-xl transition-opacity duration-200 ${ing.mustUse ? 'opacity-100' : 'opacity-25 hover:opacity-75'}`}>🔥</button> <span className="text-gray-800 flex-grow">{ing.name}</span> <div className="flex items-center gap-3"> <span className="text-gray-600">{ing.quantity} {ing.unit}</span> <button onClick={() => handleEdit(ing)} className="text-blue-500 hover:text-blue-700">編集</button> <button onClick={() => onDelete(ing.id)} className="text-red-500 hover:text-red-700"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg></button> </div> </div> )} </li> ))}</ul> ) : <p className="text-gray-500 text-center py-4">登録されている食材はありません。</p>} </div> ); };
const AllergyForm = ({ newAllergy, onAdd, onChange }) => ( <div className="bg-white p-6 rounded-xl shadow-lg"> <h2 className="text-2xl font-semibold mb-4 text-gray-700">アレルギー登録</h2> <form onSubmit={onAdd} className="flex gap-2"> <input type="text" value={newAllergy} onChange={onChange} placeholder="例: えび" required className="flex-grow input-style" /> <button type="submit" className="btn-primary">追加</button> </form> </div> );
const AllergyList = ({ allergies, onDelete }) => ( <div className="bg-white p-6 rounded-xl shadow-lg"> <h2 className="text-2xl font-semibold mb-4 text-gray-700">アレルギーリスト</h2> {allergies.length > 0 ? ( <ul className="flex flex-wrap gap-2">{allergies.map(allergy => ( <li key={allergy.id} className="flex items-center gap-2 bg-red-100 text-red-800 text-sm font-medium px-3 py-1 rounded-full"> <span>{allergy.name}</span> <button onClick={() => onDelete(allergy.id)} className="text-red-600 hover:text-red-800">&times;</button> </li> ))}</ul> ) : ( <p className="text-gray-500 text-center py-4">アレルギー食材はありません。</p> )} </div> );
const RecipeGenerator = ({ tags, onTagChange, onGenerate, isLoading, customRequest, setCustomRequest, ...props }) => ( <div className="bg-white p-6 rounded-xl shadow-lg"> <h2 className="text-2xl font-semibold mb-4 text-gray-700">レシピの提案</h2> <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4"> <div><label htmlFor="servings" className="block text-sm font-medium text-gray-600">何人前？</label><select id="servings" name="servings" value={props.servings} onChange={(e) => props.setServings(Number(e.target.value))} className="mt-1 block w-full input-style-select">{[1,2,3,4,5,6].map(s => <option key={s} value={s}>{s}人前</option>)}</select></div> <TagSelector name="mealType" label="種類" value={tags.mealType} onChange={onTagChange} options={['', '主菜', '副菜', '汁物', 'デザート']} /> <TagSelector name="cuisine" label="ジャンル" value={tags.cuisine} onChange={onTagChange} options={['', '和食', '洋食', '中華', 'エスニック']} /> <TagSelector name="cookingMethod" label="調理法" value={tags.cookingMethod} onChange={onTagChange} options={['', '炒め物', '煮物', '揚げ物', '焼き物']} /> <TagSelector name="time" label="調理時間" value={tags.time} onChange={onTagChange} options={[{value:'', label:'指定なし'}, {value:15, label:'15分以内'}, {value:30, label:'30分以内'}]} /> </div> <div className="mb-4"> <label htmlFor="customRequest" className="block text-sm font-medium text-gray-600">自由リクエスト</label> <textarea id="customRequest" name="customRequest" rows="2" value={customRequest} onChange={(e) => setCustomRequest(e.target.value)} placeholder="例：しょっぱめで、減塩で、二郎系っぽく..." className="mt-1 block w-full input-style"></textarea> </div> <div className="flex items-center justify-center mb-4"><label className="flex items-center cursor-pointer"><input type="checkbox" checked={props.ignoreFeedback} onChange={(e) => props.setIgnoreFeedback(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" /><span className="ml-2 text-gray-700">気分転換モード (評価を無視)</span></label></div> <button onClick={() => onGenerate()} disabled={isLoading} className="w-full btn-secondary disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"> {isLoading ? '提案中...' : 'レシピを提案してもらう'} </button> {!props.hasIngredients && <p className="text-sm text-center text-yellow-600 mt-2">食材がありません。「自由リクエスト」に料理名などを入力して提案を開始できます。</p>} </div> );
const TagSelector = ({ name, label, value, onChange, options }) => ( <div> <label htmlFor={name} className="block text-sm font-medium text-gray-600">{label}</label> <select id={name} name={name} value={value} onChange={onChange} className="mt-1 block w-full input-style-select"> {options.map(opt => typeof opt === 'object' ? <option key={opt.value} value={opt.value}>{opt.label}</option> : <option key={opt} value={opt}>{opt || '指定なし'}</option>)} </select> </div> );
const RecipeDisplay = ({ recipe, onRegenerate, onAddToShoppingList, onRate, history, isReasonLoading, ...props }) => {
    const correspondingHistoryItem = history.find(h => h.recipeName === recipe.recipeName);
    const itemForFeedback = correspondingHistoryItem || recipe;

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg animate-fade-in">
            <h2 className="text-3xl font-bold mb-2 text-gray-800">{recipe.recipeName}</h2>
            <div className="flex justify-between items-center text-gray-600 mb-4">
                <p className="italic">{recipe.description}</p>
                <span className="font-semibold bg-green-100 text-green-800 px-3 py-1 rounded-full">{recipe.servings || 1}人前</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
                <div className="flex items-center gap-1"><span>調理時間: 約{recipe.timeRequired}分</span></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div><h3 className="text-xl font-semibold mb-3">使用する食材 (手持ち)</h3><ul className="list-disc list-inside space-y-1">{recipe.usedIngredients.map((ing, i) => <li key={i}>{ing.name} - {ing.displayText} <span className="text-gray-500 text-sm">({ing.baseQuantity}{ing.baseUnit})</span></li>)}</ul></div>
                <div><h3 className="text-xl font-semibold mb-3">追加で必要な食材</h3>{recipe.additionalIngredients.length > 0 ? <ul className="list-disc list-inside space-y-1">{recipe.additionalIngredients.map((ing, i) => <li key={i}>{ing.name} - {ing.displayText} <span className="text-gray-500 text-sm">({ing.baseQuantity}{ing.baseUnit})</span></li>)}</ul> : <p className="text-gray-500">ありません</p>}</div>
            </div>
            <div><h3 className="text-xl font-semibold mb-3">作り方</h3><ol className="list-decimal list-inside space-y-3">{recipe.instructions.map((step, i) => <li key={i}>{step}</li>)}</ol></div>
            
            <div className="mt-8 pt-6 border-t space-y-4">
                {isReasonLoading && (
                    <div className="flex justify-center items-center p-4 bg-gray-50 rounded-lg">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                        <p className="ml-3 text-gray-600">提案理由を考えています...</p>
                    </div>
                )}
                {recipe.suggestionReason && (
                    <div className="p-4 bg-blue-50 border-l-4 border-blue-400 animate-fade-in">
                        <p className="font-bold text-blue-800">💡 AIからの提案理由</p>
                        <p className="text-blue-700 mt-1">{recipe.suggestionReason}</p>
                    </div>
                )}

                <NutritionAnalysis recipe={recipe} history={history} {...props} />

                <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-700 mb-3 text-center">このレシピの評価をフィードバック</h3>
                    <FeedbackButtons historyItem={itemForFeedback} onFeedback={onRate} />
                </div>
                <div className="flex flex-col gap-3">
                    <button onClick={() => onAddToShoppingList(recipe)} className="w-full btn-primary">買い物リストに不足分を追加</button>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button onClick={() => props.onMake(recipe)} className="w-full btn-danger disabled:bg-gray-400 disabled:cursor-not-allowed" disabled={props.ingredients.length === 0} title={props.ingredients.length === 0 ? "食材が登録されていないため、この機能は使用できません" : ""}>このレシピを作る</button>
                        <button onClick={() => props.onBookmark(recipe)} className="w-full btn-outline">ブックマーク</button>
                        <button onClick={onRegenerate} className="w-full btn-outline-secondary">別のレシピを提案</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
const HistoryList = ({ history, onFeedback, onSelect }) => ( <div className="bg-white p-6 rounded-xl shadow-lg"> <h2 className="text-2xl font-semibold mb-4 text-gray-700">作った料理の履歴</h2> {history.length > 0 ? ( <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">{history.map(item => ( <div key={item.id} className="bg-gray-50 p-4 rounded-lg"> <p className="font-bold text-lg text-gray-800 cursor-pointer hover:text-green-600" onClick={() => onSelect(item)}>{item.recipeName}</p> <p className="text-sm text-gray-500 mb-3">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('ja-JP') : ''}</p> <FeedbackButtons historyItem={item} onFeedback={onFeedback} /> </div> ))}</div> ) : <p className="text-gray-500 text-center py-4">まだ料理履歴がありません。</p>} </div> );
const FeedbackButtons = ({ historyItem, onFeedback }) => ( <div className="flex items-center gap-2 flex-wrap justify-center"> <span className="text-sm font-medium text-gray-600">評価:</span> {[{ key: 'great', label: '最高！' }, { key: 'good', label: 'いいね' }, { key: 'bad', label: 'よくないね' }].map(fb => ( <button key={fb.key} onClick={() => onFeedback(historyItem, fb.key)} className={`px-3 py-1 text-sm font-semibold rounded-full transition-all duration-200 ${historyItem.feedback === fb.key ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-blue-200'}`}>{fb.label}</button>))} </div> );
const CollapsibleBookmarkList = ({ bookmarks, onDelete, onSelect, isOpen, setIsOpen }) => ( <div className="bg-white p-6 rounded-xl shadow-lg"> <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-2xl font-semibold text-gray-700"> <span>ブックマーク</span> <span className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>▼</span> </button> {isOpen && ( <div className="mt-4 animate-fade-in"> {bookmarks.length > 0 ? ( <ul className="space-y-3 max-h-60 overflow-y-auto pr-2">{bookmarks.map(bm => ( <li key={bm.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg"> <span className="text-gray-800 flex-1 truncate pr-2 cursor-pointer hover:text-green-600 transition-colors" onClick={() => onSelect(bm)}>{bm.recipeName}</span> <button onClick={() => onDelete(bm.id)} className="text-red-500 hover:text-red-700 transition-colors flex-shrink-0"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg></button> </li> ))}</ul> ) : ( <p className="text-gray-500 text-center py-4">ブックマークはありません。</p> )} </div> )} </div> );
const ModalBase = ({ children, onClose }) => ( <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4"> <div className="bg-white rounded-xl shadow-2xl p-6 md:p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in relative"> <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button> {children} </div> </div> );
const RecipeDetailModal = ({ recipe, userProfile, ingredients, allergies, history, onClose, children }) => { if (!recipe) return null; return ( <ModalBase onClose={onClose}> <h2 className="text-3xl font-bold text-gray-800 mb-2">{recipe.recipeName}</h2> <div className="flex justify-between items-center text-gray-600 mb-4"> <p className="italic">{recipe.description}</p> <span className="font-semibold bg-green-100 text-green-800 px-3 py-1 rounded-full">{recipe.servings || 1}人前</span> </div> <div className="flex items-center gap-4 text-sm text-gray-500 mb-6"><span>調理時間: 約{recipe.timeRequired}分</span></div> <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6"> <div><h3 className="text-xl font-semibold mb-3">使用する食材</h3><ul className="list-disc list-inside space-y-1">{[...(recipe.usedIngredients || []), ...(recipe.additionalIngredients || [])].map((ing, i) => <li key={`all-ing-${i}`}>{ing.name} - {ing.displayText} <span className="text-gray-500 text-sm">({ing.baseQuantity}{ing.baseUnit})</span></li>)}</ul></div> </div> <div><h3 className="text-xl font-semibold mb-3">作り方</h3><ol className="list-decimal list-inside space-y-3">{recipe.instructions.map((step, i) => <li key={`inst-${i}`}>{step}</li>)}</ol></div> <NutritionAnalysis recipe={recipe} userProfile={userProfile} ingredients={ingredients} allergies={allergies} history={history} /> <div className="mt-8 flex flex-col sm:flex-row gap-3">{children}</div> </ModalBase> ); };
const BookmarkDetailModal = ({ recipe, userProfile, ingredients, allergies, history, onClose, onDelete, onMake, onRate, onAddToShoppingList }) => {
    const correspondingHistoryItem = history.find(h => h.recipeName === recipe.recipeName);
    const itemForFeedback = correspondingHistoryItem || recipe;

    return (
        <RecipeDetailModal recipe={recipe} userProfile={userProfile} ingredients={ingredients} allergies={allergies} history={history} onClose={onClose}>
            <div className="flex flex-col gap-4 w-full">
                 <button onClick={() => onAddToShoppingList(recipe)} className="w-full btn-primary">買い物リストに不足分を追加</button>
                <div className="w-full border-t pt-4">
                    <FeedbackButtons historyItem={itemForFeedback} onFeedback={onRate} />
                </div>
                <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button onClick={() => { onMake(recipe); onClose(); }} className="w-full btn-danger disabled:bg-gray-400 disabled:cursor-not-allowed" disabled={ingredients.length === 0} title={ingredients.length === 0 ? "食材が登録されていないため、この機能は使用できません" : ""}>このレシピを作る</button>
                    <button onClick={() => { onDelete(recipe.id); onClose(); }} className="w-full btn-outline-secondary">ブックマークから削除</button>
                    <button onClick={onClose} className="w-full btn-secondary">閉じる</button>
                </div>
            </div>
        </RecipeDetailModal>
    );
};
const HistoryDetailModal = ({ recipe, userProfile, ingredients, allergies, history, onClose, onDelete, onBookmark, onAddToShoppingList }) => ( <RecipeDetailModal recipe={recipe} userProfile={userProfile} ingredients={ingredients} allergies={allergies} history={history} onClose={onClose}> <div className="w-full flex flex-col gap-3"> <button onClick={() => onAddToShoppingList(recipe)} className="w-full btn-primary">買い物リストに不足分を追加</button> <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"> <button onClick={() => { onBookmark(recipe); onClose(); }} className="w-full btn-outline">このレシピをブックマーク</button> <button onClick={() => { onDelete(recipe.id); onClose(); }} className="w-full btn-outline-secondary">履歴から削除</button> <button onClick={onClose} className="w-full btn-secondary">閉じる</button> </div> </div> </RecipeDetailModal> );
const GuideModal = ({ onClose }) => (
    <ModalBase onClose={onClose}>
        <h2 className="text-3xl font-bold text-gray-800 mb-4">AIレシピさん 使い方ガイド</h2>
        <div className="space-y-6 text-gray-700">
            
            <section>
                <h3 className="text-xl font-semibold mb-2 text-green-700">このアプリについて</h3>
                <p>「AIレシピさん」は、あなたの冷蔵庫にある食材を最大限に活用し、日々の料理をサポートする賢いアシスタントです。AIがあなただけのレシピを提案し、栄養管理までお手伝いします。</p>
            </section>

            <section>
                <h3 className="text-xl font-semibold mb-2 text-green-700">基本的な使い方</h3>
                <ol className="list-decimal list-inside space-y-2">
                    <li><strong>食材を登録する:</strong> まずは家にある食材を「食材の登録」フォームから追加します。</li>
                    <li><strong>レシピを提案してもらう:</strong> 食材リストが完成したら、「レシピを提案してもらう」ボタンを押します。AIがあなたの食材や好みに合わせてレシピを考えます。</li>
                    <li><strong>料理を作る:</strong> レシピが決まったら、手順に沿って料理を楽しみましょう！「このレシピを作る」ボタンを押すと、使った食材がリストから自動で引かれます。</li>
                </ol>
            </section>

            <section>
                <h3 className="text-xl font-semibold mb-2 text-green-700">各機能の紹介</h3>
                <ul className="list-disc list-inside space-y-3">
                    <li><strong>食材の管理:</strong> 食材の横にある「🔥」マークをタップすると「使い切り」モードになります。AIがその食材を優先的に消費するレシピを提案してくれます。</li>
                    <li><strong>買い物リスト:</strong> レシピを見て足りない食材があったら、「買い物リストに不足分を追加」ボタンでリストアップ。買った後はチェックを入れるだけで食材リストに移動でき、とても便利です。</li>
                    <li><strong>履歴と評価:</strong> 作った料理は自動で履歴に記録されます。評価を付けると、AIがあなたの好みを学習し、次の提案に活かしてくれます。</li>
                    <li><strong>ブックマーク:</strong> 気に入ったレシピはブックマークして、いつでも見返せます。</li>
                    <li><strong>栄養分析:</strong> レシピ画面の「AI栄養アドバイス」ボタンを押すと、AI管理栄養士がそのレシピの栄養価を分析し、バランスを良くするための献立も提案してくれます。</li>
                    <li><strong>データ管理:</strong> ページ下部の「データ管理」から、全データのバックアップ（エクスポート）や復元（インポート）が可能です。機種変更の際などにご利用ください。</li>
                </ul>
            </section>
            
            <section>
                <h3 className="text-xl font-semibold mb-2 text-green-700">よくある質問 (Q&A)</h3>
                <div className="space-y-3">
                    <div>
                        <h4 className="font-semibold">Q: データはどこに保存されますか？</h4>
                        <p>A: このアプリのデータはすべて、お使いのブラウザ（Chrome, Safariなど）の中に保存されます。そのため、<strong className="text-red-600">他の端末や他のブラウザとデータは共有されません。</strong></p>
                    </div>
                    <div>
                        <h4 className="font-semibold">Q: 栄養計算の基準は何ですか？</h4>
                        <p>A: ページ下部の「プロフィール設定」で指定された性別・年齢に基づき、厚生労働省「日本人の食事摂取基準（2020年版）」の1食あたりの目安を算出しています。さらに、レシピの種類（主菜/副菜など）に応じて目標値を補正し、より現実に即した評価を行っています。</p>
                    </div>
                </div>
            </section>
        </div>
        <div className="mt-8 text-right">
            <button onClick={onClose} className="btn-primary">閉じる</button>
        </div>
    </ModalBase>
);
const DataManagement = ({ onBackup, onImportClick }) => ( <div className="mt-8 pt-8 border-t border-gray-300"> <h2 className="text-2xl font-semibold mb-4 text-gray-700">データ管理</h2> <p className="text-gray-600 mb-4">現在のすべてのデータ（食材、アレルギー、履歴、ブックマーク）をバックアップしたり、ファイルから復元したりします。</p> <div className="flex flex-col sm:flex-row gap-4"> <button onClick={onBackup} className="btn-primary">バックアップをエクスポート</button> <button onClick={onImportClick} className="btn-outline-secondary">バックアップからインポート</button> </div> </div> );
const ImportConfirmModal = ({ onConfirm, onClose }) => ( <ModalBase onClose={onClose}> <h2 className="text-2xl font-bold text-red-600 mb-4">データのインポート確認</h2> <p className="text-gray-700 mb-6">バックアップファイルをインポートします。 <strong className="text-red-700">現在のすべてのデータは、インポートするデータによって上書きされます。</strong> この操作は元に戻せません。よろしいですか？</p> <div className="flex justify-end gap-4"> <button onClick={onClose} className="btn-secondary">キャンセル</button> <button onClick={onConfirm} className="btn-danger">インポート実行</button> </div> </ModalBase> );

// --- NEW/UPDATED Components ---
const PreferenceLearner = ({ onSummarize, isSummarizing, userPreferenceSummary, preferenceSummaryLog }) => {
    const [isHelpVisible, setIsHelpVisible] = useState(false);
    const [selectedLogDate, setSelectedLogDate] = useState('');

    const displayedSummary = preferenceSummaryLog.find(log => log.date === selectedLogDate)?.summary || userPreferenceSummary;

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg mt-8">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-gray-700">AIの好み学習</h2>
                <button onClick={() => setIsHelpVisible(!isHelpVisible)} className="text-gray-400 hover:text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
            </div>

            {isHelpVisible && (
                <div className="p-4 bg-gray-50 border rounded-lg mb-4 text-sm text-gray-600 animate-fade-in">
                    <p className="font-bold mb-2">この機能について</p>
                    <p>このボタンを押すと、AIがあなたの評価履歴（最高！、いいね、よくないね）を全て分析し、あなたの食の好みを文章で要約します。</p>
                    <p className="mt-2">要約を作成することで、AIはあなたの好みをより深く理解し、レシピ提案の精度が向上します。履歴が増えてきたら、定期的に学習させるのがおすすめです。</p>
                </div>
            )}
            
            <button onClick={onSummarize} disabled={isSummarizing} className="w-full btn-outline-secondary mb-4">
                {isSummarizing ? '学習中...' : 'AIに好みを学習させる'}
            </button>

            {preferenceSummaryLog.length > 0 && (
                <div className="mb-4">
                    <label htmlFor="log-selector" className="block text-sm font-medium text-gray-600">学習ログ</label>
                    <select id="log-selector" value={selectedLogDate} onChange={(e) => setSelectedLogDate(e.target.value)} className="mt-1 block w-full input-style-select">
                        <option value="">最新の学習結果</option>
                        {preferenceSummaryLog.map(log => (
                            <option key={log.date} value={log.date}>
                                {new Date(log.date).toLocaleString('ja-JP')}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {displayedSummary && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                    <b className="block mb-1">AIが学習したあなたの好み:</b>
                    <p>{displayedSummary}</p>
                </div>
            )}
        </div>
    );
};
const ProgressIndicator = ({ isActive, label }) => {
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);
    const [timeoutMessage, setTimeoutMessage] = useState('');
    const timeoutRef = useRef(null);

    useEffect(() => {
        let progressTimer;
        if (isActive) {
            setVisible(true);
            setProgress(0);
            setTimeoutMessage('');
            if (timeoutRef.current) clearTimeout(timeoutRef.current);

            progressTimer = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 95) {
                        clearInterval(progressTimer);
                        timeoutRef.current = setTimeout(() => {
                            setTimeoutMessage('（頑張って考えています...！）');
                        }, 5000);
                        return 95;
                    }
                    return prev + 5;
                });
            }, 200);
        } else if (visible) {
            if (progressTimer) clearInterval(progressTimer);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setProgress(100);
            setTimeout(() => {
                setVisible(false);
                setTimeoutMessage('');
            }, 500);
        }

        return () => {
            if (progressTimer) clearInterval(progressTimer);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [isActive]);

    if (!visible) return null;

    return (
        <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                <div 
                    className="bg-green-600 h-6 rounded-full transition-all duration-300 ease-in-out flex items-center justify-center text-white text-sm font-bold"
                    style={{ width: `${progress}%` }}
                >
                    <span>{label} ({progress}%) {timeoutMessage}</span>
                </div>
            </div>
        </div>
    );
};

const UserProfileSettings = ({ profile, onProfileChange }) => {
    const handleGenderChange = (e) => onProfileChange({ ...profile, gender: e.target.value });
    const handleAgeChange = (e) => onProfileChange({ ...profile, age: e.target.value });

    return (
        <div className="mt-8 pt-8 border-t border-gray-300">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">プロフィール設定</h2>
            <p className="text-gray-600 mb-4">栄養計算の精度向上のため、あなたの性別と年齢層を設定してください。</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="gender" className="block text-sm font-medium text-gray-600">性別</label>
                    <select id="gender" value={profile.gender} onChange={handleGenderChange} className="mt-1 block w-full input-style-select">
                        <option value="male">男性</option>
                        <option value="female">女性</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="age" className="block text-sm font-medium text-gray-600">年齢</label>
                    <select id="age" value={profile.age} onChange={handleAgeChange} className="mt-1 block w-full input-style-select">
                        <option value="18-29">18-29歳</option>
                        <option value="30-49">30-49歳</option>
                        <option value="50-64">50-64歳</option>
                        <option value="65-74">65-74歳</option>
                        <option value="75+">75歳以上</option>
                    </select>
                </div>
            </div>
        </div>
    );
};

const MarkdownRenderer = ({ text }) => {
    if (!text) return null;
    const paragraphs = text.split('\n').map((paragraph, pIndex) => {
        const parts = paragraph.split(/(\*\*.*?\*\*)/g).filter(Boolean);
        return (
            <p key={pIndex} className="mb-2 last:mb-0">
                {parts.map((part, index) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={index}>{part.slice(2, -2)}</strong>;
                    }
                    return <span key={index}>{part}</span>;
                })}
            </p>
        );
    });
    return <div className="text-gray-700">{paragraphs}</div>;
};

const NutritionAnalysis = ({ recipe, userProfile, ingredients, allergies, history }) => {
    const [analysis, setAnalysis] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState(null);

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setError(null);
        setAnalysis(null);

        const allRecipeIngredients = [...(recipe.usedIngredients || []), ...(recipe.additionalIngredients || [])];
        const ingredientsList = allRecipeIngredients.map(ing => `${ing.name} ${ing.displayText}`).join(', ');
        
        const allergyList = allergies.map(a => a.name).join(', ') || 'なし';
        const availableIngredients = ingredients.map(i => `${i.name} (${i.quantity}${i.unit})`).join(', ') || 'なし';
        
        let preferencePrompt = 'ユーザーの好みは不明です。';
        const reviewedHistory = history.filter(item => item.feedback);
        if (reviewedHistory.length > 0) {
            const goodFeedback = reviewedHistory.filter(i => i.feedback === 'good' || i.feedback === 'great').map(i => i.recipeName).join(', ');
            const badFeedback = reviewedHistory.filter(i => i.feedback === 'bad').map(i => i.recipeName).join(', ');
            preferencePrompt = `ユーザーは過去に以下の料理を好みました: [${goodFeedback || 'なし'}]。以下の料理は好みませんでした: [${badFeedback || 'なし'}]。`;
        }

        const prompt = `あなたは、ユーザーの健康をサポートするAI管理栄養士です。丁寧な言葉遣い（ですます調）で、的確なアドバイスをしてください。

# ユーザー情報
- プロフィール: ${userProfile.gender === 'male' ? '男性' : '女性'}, ${userProfile.age}歳
- アレルギー: ${allergyList}
- 手持ちの食材: ${availableIngredients}
- 食事の好み: ${preferencePrompt}

# レシピ情報
- レシピ名: ${recipe.recipeName}
- 分量: ${recipe.servings || 1}人前
- 種類: ${recipe.mealType}
- 材料: ${ingredientsList}

# 指示
以下の3つの項目について分析し、指定されたJSON形式で回答してください。

1.  **nutritionValues**: レシピの栄養価を**1人前あたり**で計算してください。計算する栄養素は以下の通りです。
    - エネルギー(kcal), たんぱく質(g), 脂質(g), 炭水化物(g), 食塩相当量(g), ビタミンA(μgRAE), ビタミンC(mg), ビタミンD(μg), ビタミンB6(mg), ビタミンB12(μg), カルシウム(mg), 鉄(mg), 亜鉛(mg)
2.  **impression**: 栄養価と材料から、このレシピの良い点を具体的に褒めてください。その後、もし改善点があれば「少し気になるのは〇〇です。△△を意識すると、もっと素晴らしい食事になりますよ。」といった形で、優しく的確に指摘してください。
3.  **suggestion**: この食事の栄養バランスをさらに良くするための、具体的な献立を1〜2品提案してください。**ユーザーの手持ち食材、好み、アレルギーを最大限考慮**し、なぜそれが必要なのかという栄養的な理由も添えてください。`;
        
        const nutritionSchema = { type: "OBJECT", properties: { calories: { type: "NUMBER" }, protein: { type: "NUMBER" }, fat: { type: "NUMBER" }, carbs: { type: "NUMBER" }, salt: { type: "NUMBER" }, vitaminA: { type: "NUMBER" }, vitaminC: { type: "NUMBER" }, vitaminD: { type: "NUMBER" }, vitaminB6: { type: "NUMBER" }, vitaminB12: { type: "NUMBER" }, calcium: { type: "NUMBER" }, iron: { type: "NUMBER" }, zinc: { type: "NUMBER" } } };
        const schema = { type: "OBJECT", properties: { nutritionValues: nutritionSchema, impression: { type: "STRING" }, suggestion: { type: "STRING" } }, required: ["nutritionValues", "impression", "suggestion"] };

        try {
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } };
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`API error: ${response.statusText}`);
            const result = await response.json();
            if (result.candidates?.[0]?.content?.parts?.[0]) {
                setAnalysis(JSON.parse(result.candidates[0].content.parts[0].text));
            } else { setError("分析とアドバイスの生成に失敗しました。"); }
        } catch (err) { setError("分析とアドバイスの生成中にエラーが発生しました。"); } finally { setIsAnalyzing(false); }
    };

    return (
        <div className="mt-6 border-t pt-4">
            <button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full btn-secondary">
                {isAnalyzing ? '分析中...' : 'AI栄養アドバイスを見る'}
            </button>
            <ProgressIndicator isActive={isAnalyzing} label="栄養分析中" />
            {error && <p className="text-red-600 mt-2">{error}</p>}
            {analysis && !isAnalyzing && (
                <div className="animate-fade-in">
                    <NutritionDisplay nutrition={analysis.nutritionValues || recipe.nutritionValues} userProfile={userProfile} mealType={recipe.mealType} />
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                        <div>
                            <p className="font-semibold text-blue-800">💡 栄養バランス所感</p>
                            <MarkdownRenderer text={analysis.impression} />
                        </div>
                        <div>
                            <p className="font-semibold text-blue-800">🥗 おすすめの献立提案</p>
                            <MarkdownRenderer text={analysis.suggestion} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const NutritionDisplay = ({ nutrition, userProfile, mealType }) => {
    // 厚生労働省「日本人の食事摂取基準（2020年版）」身体活動レベルII（ふつう）
    const dailyIntakeReferences = {
        male: {
            '18-29': { calories: 2650, protein: 65, fat: 74, carbs: 364, salt: 7.5, vitaminA: 850, vitaminC: 100, vitaminD: 8.5, vitaminB6: 1.4, vitaminB12: 2.4, calcium: 800, iron: 7.5, zinc: 11 },
            '30-49': { calories: 2700, protein: 65, fat: 75, carbs: 371, salt: 7.5, vitaminA: 900, vitaminC: 100, vitaminD: 8.5, vitaminB6: 1.4, vitaminB12: 2.4, calcium: 750, iron: 7.5, zinc: 11 },
            '50-64': { calories: 2600, protein: 65, fat: 72, carbs: 358, salt: 7.5, vitaminA: 900, vitaminC: 100, vitaminD: 8.5, vitaminB6: 1.4, vitaminB12: 2.4, calcium: 750, iron: 7.5, zinc: 11 },
            '65-74': { calories: 2400, protein: 60, fat: 67, carbs: 330, salt: 7.5, vitaminA: 850, vitaminC: 100, vitaminD: 8.5, vitaminB6: 1.4, vitaminB12: 2.4, calcium: 750, iron: 7.0, zinc: 10 },
            '75+':   { calories: 2100, protein: 60, fat: 58, carbs: 289, salt: 7.5, vitaminA: 800, vitaminC: 100, vitaminD: 8.5, vitaminB6: 1.4, vitaminB12: 2.4, calcium: 700, iron: 7.0, zinc: 9 },
        },
        female: {
            '18-29': { calories: 2000, protein: 50, fat: 56, carbs: 275, salt: 6.5, vitaminA: 650, vitaminC: 100, vitaminD: 8.5, vitaminB6: 1.1, vitaminB12: 2.4, calcium: 650, iron: 10.5, zinc: 8 },
            '30-49': { calories: 2050, protein: 50, fat: 57, carbs: 282, salt: 6.5, vitaminA: 700, vitaminC: 100, vitaminD: 8.5, vitaminB6: 1.1, vitaminB12: 2.4, calcium: 650, iron: 10.5, zinc: 8 },
            '50-64': { calories: 1950, protein: 50, fat: 54, carbs: 268, salt: 6.5, vitaminA: 700, vitaminC: 100, vitaminD: 8.5, vitaminB6: 1.1, vitaminB12: 2.4, calcium: 650, iron: 11.0, zinc: 8 },
            '65-74': { calories: 1850, protein: 50, fat: 51, carbs: 254, salt: 6.5, vitaminA: 700, vitaminC: 100, vitaminD: 8.5, vitaminB6: 1.1, vitaminB12: 2.4, calcium: 650, iron: 6.0, zinc: 8 },
            '75+':   { calories: 1650, protein: 50, fat: 46, carbs: 227, salt: 6.5, vitaminA: 650, vitaminC: 100, vitaminD: 8.5, vitaminB6: 1.1, vitaminB12: 2.4, calcium: 600, iron: 6.0, zinc: 7 },
        }
    };

    const mealTypeCorrection = { '主菜': 1.0, '副菜': 0.4, '汁物': 0.2, 'デザート': 0.15 };
    const dailyRef = dailyIntakeReferences[userProfile.gender][userProfile.age];
    const correctionFactor = mealTypeCorrection[mealType] || 1.0;
    
    const referenceValues = {
        calories: { value: (dailyRef.calories / 3) * correctionFactor, name: "エネルギー", unit: "kcal" },
        protein:  { value: (dailyRef.protein / 3) * correctionFactor, name: "たんぱく質", unit: "g" },
        fat:      { value: (dailyRef.fat / 3) * correctionFactor, name: "脂質", unit: "g" },
        carbs:    { value: (dailyRef.carbs / 3) * correctionFactor, name: "炭水化物", unit: "g" },
        salt:     { value: (dailyRef.salt / 3) * correctionFactor, name: "食塩相当量", unit: "g" },
        vitaminA: { value: (dailyRef.vitaminA / 3) * correctionFactor, name: "ビタミンA", unit: "μgRAE" },
        vitaminC: { value: (dailyRef.vitaminC / 3) * correctionFactor, name: "ビタミンC", unit: "mg" },
        vitaminD: { value: (dailyRef.vitaminD / 3) * correctionFactor, name: "ビタミンD", unit: "μg" },
        vitaminB6:{ value: (dailyRef.vitaminB6 / 3) * correctionFactor, name: "ビタミンB6", unit: "mg" },
        vitaminB12:{ value: (dailyRef.vitaminB12 / 3) * correctionFactor, name: "ビタミンB12", unit: "μg" },
        calcium:  { value: (dailyRef.calcium / 3) * correctionFactor, name: "カルシウム", unit: "mg" },
        iron:     { value: (dailyRef.iron / 3) * correctionFactor, name: "鉄", unit: "mg" },
        zinc:     { value: (dailyRef.zinc / 3) * correctionFactor, name: "亜鉛", unit: "mg" },
    };

    const getEvaluation = (key, value) => {
        const ref = referenceValues[key].value;
        const ratio = (value / ref) * 100;
        if (ratio > 130) return { label: '過剰', color: 'bg-red-500' };
        if (ratio > 70) return { label: '適量', color: 'bg-green-500' };
        return { label: '不足', color: 'bg-blue-500' };
    };

    const macroNutrients = { calories: nutrition.calories, protein: nutrition.protein, fat: nutrition.fat, carbs: nutrition.carbs, salt: nutrition.salt };
    const microNutrients = { vitaminA: nutrition.vitaminA, vitaminC: nutrition.vitaminC, vitaminD: nutrition.vitaminD, vitaminB6: nutrition.vitaminB6, vitaminB12: nutrition.vitaminB12, calcium: nutrition.calcium, iron: nutrition.iron, zinc: nutrition.zinc };
    
    const renderNutrient = (key, value) => {
        if (!referenceValues[key] || value === undefined) return null;
        const evalResult = getEvaluation(key, value);
        const percentage = Math.min((value / referenceValues[key].value) * 100, 100);
        const { name, unit } = referenceValues[key];
        return (
            <div key={key}>
                <div className="flex justify-between items-center text-sm mb-1">
                    <span className="font-bold">{name}</span>
                    <span className={`${evalResult.color.replace('bg-', 'text-')} font-bold`}>{evalResult.label}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 relative overflow-hidden"><div className={`${evalResult.color} h-4 rounded-full`} style={{ width: `${percentage}%` }}></div></div>
                <div className="text-right text-xs text-gray-600 mt-1">{value.toFixed(1)}{unit} / 目安 {referenceValues[key].value.toFixed(1)}{unit}</div>
            </div>
        );
    };

    return (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-xl font-semibold mb-3">栄養成分（1人前）</h3>
            <p className="text-xs text-gray-500 mb-4">※{userProfile.gender === 'male' ? '男性' : '女性'}・{userProfile.age}歳、レシピ種類「{mealType || '不明'}」として計算</p>
            <div className="space-y-4">
                <div>
                    <h4 className="font-bold text-lg mb-2">主要栄養素</h4>
                    <div className="space-y-3">{Object.entries(macroNutrients).map(([key, value]) => renderNutrient(key, value))}</div>
                </div>
                <div>
                    <h4 className="font-bold text-lg mb-2 mt-4">ビタミン・ミネラル</h4>
                    <div className="space-y-3">{Object.entries(microNutrients).map(([key, value]) => renderNutrient(key, value))}</div>
                </div>
            </div>
        </div>
    );
};


const style = document.createElement('style');
style.textContent = `
    .input-style { margin-top: 0.25rem; display: block; width: 100%; padding-left: 0.75rem; padding-right: 0.75rem; padding-top: 0.5rem; padding-bottom: 0.5rem; background-color: #fff; border: 1px solid #d1d5db; border-radius: 0.5rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
    .input-style:focus { outline: 2px solid transparent; outline-offset: 2px; --tw-ring-color: #10b981; border-color: #10b981; }
    .input-style-select { margin-top: 0.25rem; display: block; width: 100%; padding-left: 0.75rem; padding-right: 2rem; padding-top: 0.5rem; padding-bottom: 0.5rem; background-color: #fff; border: 1px solid #d1d5db; border-radius: 0.5rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e"); background-position: right 0.5rem center; background-repeat: no-repeat; background-size: 1.5em 1.5em; }
    .btn-primary { background-color: #16a34a; color: #fff; font-weight: 700; padding: 0.5rem 1rem; border-radius: 0.5rem; transition: background-color 0.3s; }
    .btn-primary:hover { background-color: #15803d; }
    .btn-primary-sm { background-color: #16a34a; color: #fff; font-weight: 700; padding: 0.25rem 0.5rem; border-radius: 0.375rem; transition: background-color 0.3s; }
    .btn-primary-sm:hover { background-color: #15803d; }
    .btn-secondary-sm { background-color: #6b7280; color: #fff; font-weight: 700; padding: 0.25rem 0.5rem; border-radius: 0.375rem; transition: background-color 0.3s; }
    .btn-secondary-sm:hover { background-color: #4b5563; }
    .btn-secondary { background-color: #2563eb; color: #fff; font-weight: 700; padding: 0.75rem 1rem; border-radius: 0.5rem; transition: all 0.3s; }
    .btn-secondary:hover { background-color: #1d4ed8; }
    .btn-danger { background-color: #dc2626; color: #fff; font-weight: 700; padding: 0.75rem 1rem; border-radius: 0.5rem; transition: background-color 0.3s; }
    .btn-danger:hover { background-color: #b91c1c; }
    .btn-outline { background-color: transparent; border: 1px solid #2563eb; color: #2563eb; font-weight: 700; padding: 0.5rem 1rem; border-radius: 0.5rem; transition: all 0.3s; }
    .btn-outline:hover { background-color: #dbeafe; }
    .btn-outline-secondary { background-color: transparent; border: 1px solid #6b7280; color: #6b7280; font-weight: 700; padding: 0.5rem 1rem; border-radius: 0.5rem; transition: all 0.3s; }
    .btn-outline-secondary:hover { background-color: #f3f4f6; }
    @keyframes fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
`;
document.head.append(style);

