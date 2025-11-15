Your current task is {{task}}, given {{question}}, return back the output masking PII instances with [PII]

—

Task: Mask all personally identifiable information (PII) in a given message by replacing each PII instance with the exact token [PII]. Return only the masked message, preserving all original non-PII text, punctuation, and spacing.

What to mask (non-exhaustive, based on dataset behavior):
- Person names: Replace the full contiguous name phrase with a single [PII]. Example: “Gerasimos Marciano” -> [PII]
- Street addresses:
  - Split the numeric house number and the street name into two [PII] tokens. Example: “7351 North Rancho Drive” -> “[PII] [PII]”
  - Keep directionals and street types (e.g., North, Drive) within the street-name [PII].
- Cities/places/geo names: Replace the entire multi-word place name with a single [PII]. Example: “Virginia Beach” -> [PII], “Santa Margarita” -> [PII]
- Dates: Replace a full date expression as one [PII]. Example: “12th April 1961” -> [PII]
- Times: Replace time expressions (with or without AM/PM, 12h/24h) as one [PII]. Examples: “5:47 PM” -> [PII], “00:21” -> [PII], “5:22” -> [PII]
- Phone numbers and numeric identifiers (including postal codes, code-like sequences):
  - Treat a contiguous numeric block (digits optionally separated by spaces or hyphens and without intervening words) as a single [PII]. Examples:
    - “00516-617 644-0910” -> [PII]
    - “02134 51639” -> [PII]
  - Exception: In street addresses, split house number vs. street name as noted above.

Grouping rules:
- Multi-word entities that form one logical PII (person names, place names, full dates) -> one [PII].
- Contiguous numeric/hyphen/space-only sequences -> one [PII], unless it’s a house number preceding a street name (then two [PII]).
- For addresses formatted as “<number> <street name>, <city>”, the expected mask will look like “[PII] [PII], [PII]”.

Output rules:
- Replace only PII tokens with “[PII]”.
- Preserve all other text, punctuation, quotes, and spacing exactly as in the input.
- Do not add or remove content beyond substitutions.
- Return only the masked message (no explanations or metadata).

If a pii_count is provided in context, ensure the number of “[PII]” tokens in your output matches it. If needed, adjust grouping (merge or split contiguous PII segments) to match the expected count while following the rules above.

Examples reflected by the dataset:
- “5:47 PM 02134 51639 : 'Sounds like a plan. I'll make a reservation for 00:21.'”
  -> “[PII] [PII]: 'Sounds like a plan. I'll make a reservation for [PII].'”
- “Record of Discussion: … at Virginia Beach … with 00516-617 644-0910.”
  -> “Record of Discussion: … at [PII] … with [PII].”
- “Dear Gerasimos Marciano, … report to 7351 North Rancho Drive, Santa Margarita at 5:22 on 12th April 1961 …”
  -> “Dear [PII], … report to [PII] [PII], [PII] at [PII] on [PII] …”

——

QA to ensure no PII has been masked
    
Score from 0-1 where:
- 0: An instance of PII has not been masked with [PII]
- 1: Perfect PII detection with no false positives or misses

——

uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000





- Some unique way to attach scores and views to prompts so u can evaluate when ran? Reinventing experiments from langsmith from first principles
    - saving outputs and scores with a specific prompt in the view instead of having to rerun?
- composite scoring
- Persisting errors visually (i.e. if I get an error and then something else happens it updates and removes it)
- better eval processing (actually queued and all not sequential)
- overall metrics (summaries of averages)?
- rubric?
- weighting?
- meta prompt agent? (Could be useful for the human feedback type)
- huge code review and minimization needed for front back and eval package and tech debt
- favicon 
- readme
- logo
- Add cosine similarity?

- shouldnt be able to edit the prompt or click the column buttons if running (espec run all)
- gepa running is highlighted green