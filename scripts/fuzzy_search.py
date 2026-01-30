from rapidfuzz import fuzz, process
import re

class FuzzySearch:
    
    @staticmethod
    def normalize_text(text):
        """Normalize text for better matching"""
        if not text:
            return ""
        
        # Convert to lowercase
        text = text.lower()
        
        # Remove special characters but keep spaces and hyphens
        text = re.sub(r'[^\w\s-]', ' ', text)
        
        # Replace multiple spaces with single space
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    @staticmethod
    def tokenize(text):
        """Split text into words"""
        normalized = FuzzySearch.normalize_text(text)
        return normalized.split()
    
    @staticmethod
    def calculate_match_score(query, candidate):
        """
        Calculate comprehensive match score using multiple strategies
        Returns score between 0-100
        """
        if not query or not candidate:
            return 0
        
        query_norm = FuzzySearch.normalize_text(query)
        candidate_norm = FuzzySearch.normalize_text(candidate)
        
        # Strategy 1: Exact substring match (highest priority)
        if query_norm in candidate_norm:
            return 100
        
        # Strategy 2: Check if candidate contains query (case insensitive)
        if query_norm.lower() in candidate_norm.lower():
            return 100
        
        # Strategy 3: Token ratio (word-based matching)
        token_score = fuzz.token_sort_ratio(query_norm, candidate_norm)
        
        # Strategy 4: Partial ratio (substring similarity) - MORE GENEROUS
        partial_score = fuzz.partial_ratio(query_norm, candidate_norm)
        
        # Strategy 5: Word-level matching with FUZZY tolerance
        query_tokens = FuzzySearch.tokenize(query)
        candidate_tokens = FuzzySearch.tokenize(candidate)
        
        word_match_score = 0
        if query_tokens and candidate_tokens:
            # Check if any query word fuzzy matches any candidate word
            for q_word in query_tokens:
                for c_word in candidate_tokens:
                    # Substring match
                    if q_word in c_word or c_word in q_word:
                        word_match_score = max(word_match_score, 95)
                    else:
                        # FUZZY match with LOWER threshold (60 instead of 80)
                        word_sim = fuzz.ratio(q_word, c_word)
                        if word_sim >= 60:  # Allow more spelling mistakes
                            word_match_score = max(word_match_score, word_sim)
        
        # Strategy 6: Overall fuzzy ratio
        overall_score = fuzz.ratio(query_norm, candidate_norm)
        
        # Strategy 7: Check for common misspellings/variations
        # jebel vs jabal, indian vs inian, south vs soth
        misspelling_score = 0
        
        # Common letter substitutions/omissions
        variations = [
            query_norm.replace('a', 'e'),
            query_norm.replace('e', 'a'),
            query_norm.replace('i', 'e'),
            query_norm.replace('e', 'i'),
            query_norm.replace('o', 'a'),
            query_norm.replace('a', 'o'),
            # Missing letters
            query_norm.replace('u', ''),
            query_norm.replace('th', 't'),
        ]
        
        for variation in variations:
            if variation in candidate_norm:
                misspelling_score = 90
                break
        
        # Combine scores with weights - FAVOR partial matches
        combined_score = max(
            token_score * 0.25 + partial_score * 0.35 + word_match_score * 0.4,
            overall_score,
            misspelling_score
        )
        
        return combined_score
    
    @staticmethod
    def search(query, candidates, limit=10, threshold=50):
        if not candidates:
            return []
        
        # If no query, return all candidates
        if not query:
            return [{'id': c, 'name': c, 'score': 100} for c in candidates[:limit]]
        
        results = []
        
        for candidate in candidates:
            score = FuzzySearch.calculate_match_score(query, candidate)
            
            if score >= threshold:
                results.append({
                    'id': candidate,
                    'name': candidate,
                    'score': score
                })
        
        # Sort by score descending
        results.sort(key=lambda x: x['score'], reverse=True)
        
        # Return top N results
        return results[:limit]
    
    @staticmethod
    def search_with_context(query, candidates, limit=10, threshold=50, context_field=None):
        if not candidates:
            return []
        
        # If no query, return all candidates
        if not query:
            return candidates[:limit]
        
        results = []
        
        for candidate in candidates:
            name = candidate.get('name', '')
            score = FuzzySearch.calculate_match_score(query, name)
            
            # Also check context field if provided
            if context_field and context_field in candidate:
                context_score = FuzzySearch.calculate_match_score(query, candidate[context_field])
                score = max(score, context_score * 0.8)  # Context matches weighted slightly lower
            
            if score >= threshold:
                results.append({
                    **candidate,
                    'score': score
                })
        
        # Sort by score descending
        results.sort(key=lambda x: x['score'], reverse=True)
        
        return results[:limit]