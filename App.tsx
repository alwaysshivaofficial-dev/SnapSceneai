import React, { useState, useCallback, useEffect } from 'react';
import { AppStep, ActionType } from './types';
import Header from './components/Header';
import UploadStep from './components/UploadStep';
import ResultDisplay from './components/ResultDisplay';
import { editImage, verifyIsAvatar, generateSurprisePrompt, enhancePrompt } from './services/geminiService';
import { fileToBase64 } from './utils/fileUtils';
import ChooseActionStep from './components/ChooseActionStep';
import DescribeSceneStep from './components/DescribeSceneStep';
import UploadFriendsStep from './components/UploadFriendStep';
import PremiumModal from './components/PremiumModal';
import ContestStep from './components/ContestStep';
import ContestResultStep from './components/ContestResultStep';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.Upload);
  const [actionType, setActionType] = useState<ActionType | null>(null);

  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  
  const [friendImageFiles, setFriendImageFiles] = useState<File[]>([]);
  const [friendImagePreviews, setFriendImagePreviews] = useState<string[]>([]);

  const [prompt, setPrompt] = useState<string>('');
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [removeWatermark, setRemoveWatermark] = useState<boolean>(false);
  const [isHD, setIsHD] = useState<boolean>(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState<boolean>(false);

  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [contestImages, setContestImages] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    // Cleanup object URLs on component unmount
    return () => {
      if (uploadedImagePreview) URL.revokeObjectURL(uploadedImagePreview);
      friendImagePreviews.forEach(p => URL.revokeObjectURL(p));
    };
  }, [uploadedImagePreview, friendImagePreviews]);

  const handleUpgrade = () => {
    setIsPremium(true);
    setRemoveWatermark(true);
    setIsHD(true);
    setIsPremiumModalOpen(false);
  };

  const handleImageUpload = useCallback(async (file: File) => {
    setIsVerifying(true);
    setError(null);

    try {
      const base64Image = {
        data: await fileToBase64(file),
        mimeType: file.type,
      };
      const { isAvatar, reason } = await verifyIsAvatar(base64Image);

      if (isAvatar) {
        setUploadedImageFile(file);
        const preview = URL.createObjectURL(file);
        setUploadedImagePreview(preview);
        setStep(AppStep.ChooseAction);
      } else {
        setError(`Image rejected: ${reason}. Please use a Bitmoji-style avatar.`);
      }
    } catch (err) {
      console.error(err);
      setError('Could not verify the image. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const handleAddFriendImage = useCallback(async (file: File) => {
    // For simplicity, we're not verifying friend images in this flow
    setFriendImageFiles(prev => [...prev, file]);
    const preview = URL.createObjectURL(file);
    setFriendImagePreviews(prev => [...prev, preview]);
    setError(null);
  }, []);
  
  const handleRemoveFriendImage = (index: number) => {
    const newFiles = [...friendImageFiles];
    const newPreviews = [...friendImagePreviews];
    newFiles.splice(index, 1);
    const removedPreview = newPreviews.splice(index, 1);
    URL.revokeObjectURL(removedPreview[0]);
    setFriendImageFiles(newFiles);
    setFriendImagePreviews(newPreviews);
  };

  const handleActionSelect = (type: ActionType) => {
    setActionType(type);
    if (type === 'solo') {
      setStep(AppStep.DescribeScene);
    } else if (type === 'collab' || type === 'group') {
      if(type === 'group' && !isPremium) {
        setIsPremiumModalOpen(true);
        return;
      }
      setStep(AppStep.UploadFriend);
    } else if (type === 'contest') {
        if (!isPremium) {
            setIsPremiumModalOpen(true);
            return;
        }
        setStep(AppStep.ContestMode);
    }
  };
  
  const handleBackToChoose = () => {
    setStep(AppStep.ChooseAction);
    setPrompt('');
    setError(null);
    friendImagePreviews.forEach(p => URL.revokeObjectURL(p));
    setFriendImageFiles([]);
    setFriendImagePreviews([]);
  };

  const handleToggleRemoveWatermark = () => {
    if (!isPremium) {
      setIsPremiumModalOpen(true);
    } else {
      setRemoveWatermark(prev => !prev);
    }
  };

  const handleToggleHD = () => {
      if (!isPremium) {
          setIsPremiumModalOpen(true);
      } else {
          setIsHD(prev => !prev)
      }
  }

  const handleGenerate = async (promptOverride?: string) => {
    let finalPrompt = promptOverride || prompt;
    if (!uploadedImageFile || !finalPrompt || !actionType) return;
    
    // Watermark logic: Add if not premium. If premium, add only if the user toggled it ON.
    if (!isPremium || (isPremium && !removeWatermark)) {
      finalPrompt += ". Add a small, subtle, semi-transparent watermark in the bottom-right corner with the text 'SnapScene'.";
    }

    setStep(AppStep.Generating);
    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const allFiles = [uploadedImageFile, ...friendImageFiles];
      const base64Images = await Promise.all(
        allFiles.map(async (file) => ({
          data: await fileToBase64(file),
          mimeType: file.type,
        }))
      );
      
      const generated = await editImage(base64Images, finalPrompt, isPremium && isHD);
      if (generated) {
        setGeneratedImage(`data:image/png;base64,${generated}`);
        setStep(AppStep.Result);
      } else {
        throw new Error('Failed to generate image. The result was empty.');
      }
      
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      setStep(AppStep.DescribeScene);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleGenerateContest = async () => {
    if (!prompt.trim() || !uploadedImageFile) return;

    setStep(AppStep.Generating);
    setIsLoading(true);
    setError(null);
    setContestImages([]);

    try {
        const base64Image = {
          data: await fileToBase64(uploadedImageFile),
          mimeType: uploadedImageFile.type,
        };

        // Generate 3 images in parallel
        const promises = [
            editImage([base64Image], prompt, isHD),
            editImage([base64Image], prompt, isHD),
            editImage([base64Image], prompt, isHD),
        ];

        const results = await Promise.all(promises);
        const validResults = results.filter(r => r !== null) as string[];

        if (validResults.length < 3) {
            throw new Error('Could not generate all contest images. Please try again.');
        }
        
        setContestImages(validResults.map(img => `data:image/png;base64,${img}`));
        setStep(AppStep.ContestResult);

    } catch (err) {
        console.error(err);
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(errorMessage);
        setStep(AppStep.ContestMode);
    } finally {
        setIsLoading(false);
    }
  };

  const handleSurpriseMe = async () => {
    if (!uploadedImageFile) return;
    
    setStep(AppStep.Generating);
    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);
    
    try {
      const allFiles = [uploadedImageFile, ...friendImageFiles];
      const base64Images = await Promise.all(
        allFiles.map(async (file) => ({
          data: await fileToBase64(file),
          mimeType: file.type,
        }))
      );
      const surprisePrompt = await generateSurprisePrompt(base64Images);
      setPrompt(surprisePrompt); // So user can see what was generated
      await handleGenerate(surprisePrompt);
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      setStep(AppStep.DescribeScene);
      setIsLoading(false);
    }
  };

  const handleEnhancePrompt = async () => {
    if (!prompt.trim() || !uploadedImageFile) return;

    setIsEnhancingPrompt(true);
    setError(null);
    try {
       const allFiles = [uploadedImageFile, ...friendImageFiles];
       const base64Images = await Promise.all(
        allFiles.map(async (file) => ({
          data: await fileToBase64(file),
          mimeType: file.type,
        }))
      );
      
      const enhanced = await enhancePrompt(base64Images, prompt);
      setPrompt(enhanced);
    } catch (err) {
        console.error(err);
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(errorMessage);
    } finally {
        setIsEnhancingPrompt(false);
    }
  };


  const handleReset = () => {
    if (uploadedImagePreview) URL.revokeObjectURL(uploadedImagePreview);
    friendImagePreviews.forEach(p => URL.revokeObjectURL(p));

    setStep(AppStep.Upload);
    setActionType(null);
    setUploadedImageFile(null);
    setUploadedImagePreview(null);
    setFriendImageFiles([]);
    setFriendImagePreviews([]);
    setPrompt('');
    setGeneratedImage(null);
    setContestImages([]);
    setIsLoading(false);
    setIsVerifying(false);
    // Don't reset premium status, but reset toggles to premium defaults
    setRemoveWatermark(isPremium);
    setIsHD(isPremium);
    setError(null);
  };

  const renderStep = () => {
    switch (step) {
      case AppStep.Upload:
        return <UploadStep onImageUpload={handleImageUpload} isVerifying={isVerifying} error={error} />;
      case AppStep.ChooseAction:
        return <ChooseActionStep imagePreview={uploadedImagePreview!} onSelectAction={handleActionSelect} onBack={handleReset} isPremium={isPremium} />
      case AppStep.UploadFriend:
        return <UploadFriendsStep 
                  onAddFriend={handleAddFriendImage}
                  onRemoveFriend={handleRemoveFriendImage}
                  friendPreviews={friendImagePreviews}
                  maxFriends={actionType === 'group' ? 3 : 1}
                  onBack={handleBackToChoose}
                  onDone={() => setStep(AppStep.DescribeScene)}
                />
      case AppStep.DescribeScene:
        const allPreviews = [uploadedImagePreview!, ...friendImagePreviews];
        return <DescribeSceneStep 
                  imagePreviews={allPreviews}
                  prompt={prompt} 
                  setPrompt={setPrompt} 
                  onGenerate={handleGenerate} 
                  onSurpriseMe={handleSurpriseMe}
                  onEnhancePrompt={handleEnhancePrompt}
                  isEnhancingPrompt={isEnhancingPrompt}
                  isPremium={isPremium}
                  removeWatermark={removeWatermark}
                  onToggleRemoveWatermark={handleToggleRemoveWatermark}
                  isHD={isHD}
                  onToggleHD={handleToggleHD}
                  error={error} 
                  onBack={handleBackToChoose}
               />
      case AppStep.ContestMode:
        return <ContestStep 
                imagePreview={uploadedImagePreview!}
                prompt={prompt}
                setPrompt={setPrompt}
                onGenerate={handleGenerateContest}
                onBack={handleBackToChoose}
                error={error}
                />
      case AppStep.ContestResult:
        return <ContestResultStep images={contestImages} onReset={handleReset} />
      case AppStep.Generating:
      case AppStep.Result:
        return (
          <ResultDisplay
            isLoading={isLoading}
            generatedImage={generatedImage}
            isHD={isPremium && isHD}
            onReset={handleReset}
          />
        );
      default:
        return <UploadStep onImageUpload={handleImageUpload} isVerifying={isVerifying} error={error} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 font-sans relative">
      <Header />
      
      <main className="w-full max-w-lg mt-8 flex-grow flex flex-col justify-center">
        {renderStep()}
      </main>

      <PremiumModal isOpen={isPremiumModalOpen} onClose={() => setIsPremiumModalOpen(false)} onUpgrade={handleUpgrade} />

      <footer className="text-center py-4 text-gray-500 text-sm">
        <p>Created by SnapScene</p>
      </footer>

    </div>
  );
};

export default App;