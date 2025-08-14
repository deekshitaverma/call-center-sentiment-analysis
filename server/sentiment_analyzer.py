from transformers import pipeline

def analyze_sentiment(text):
    """
    Analyzes the sentiment of a given text using a pre-trained model.

    Args:
        text (str): The text to analyze.

    Returns:
        dict: A dictionary containing the sentiment label (e.g., 'POSITIVE',
              'NEGATIVE', 'NEUTRAL') and its confidence score.
    """
    if not text:
        return {"label": "NEUTRAL", "score": 0.0}
    
    try:
        # Create a sentiment analysis pipeline. This downloads a
        # pre-trained model and tokenizer the first time it's run.
        sentiment_pipeline = pipeline("sentiment-analysis")
        
        print("Analyzing sentiment...")
        result = sentiment_pipeline(text)
        return result[0] # The pipeline returns a list, we just need the first item
        
    except Exception as e:
        print(f"Error during sentiment analysis: {e}")
        return {"label": "ERROR", "score": 0.0}