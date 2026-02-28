function approval = CKD_augmentationApprovalReport(validationTable, corrError, explainFlag)
% =========================================================
% CKD AUGMENTATION QUALITY APPROVAL SYSTEM
% =========================================================
%
% approval = CKD_augmentationApprovalReport(validation,corrError,true)
%
% INPUT
% validationTable → KS output table from pipeline
% corrError       → correlation preservation error
% explainFlag     → true/false to print explanation
%
% OUTPUT
% approval struct with decision + score
%
% =========================================================

if nargin < 3
    explainFlag = true;
end

fprintf('\n========== AUGMENTATION QUALITY CHECK ==========\n')

ks = validationTable.KS_pValue;
vars = validationTable.Variable;

% remove NaNs (IDs etc)
validIdx = ~isnan(ks);
ksClean = ks(validIdx);
varsClean = vars(validIdx);

%% =========================================================
% QUALITY METRICS
%% =========================================================

approval.KS_mean = mean(ksClean);
approval.KS_min = min(ksClean);
approval.KS_passRate = mean(ksClean > 0.05)*100;

% Quality grading
if approval.KS_mean > 0.8
    approval.KS_quality = "Excellent";
elseif approval.KS_mean > 0.5
    approval.KS_quality = "Good";
elseif approval.KS_mean > 0.2
    approval.KS_quality = "Moderate";
else
    approval.KS_quality = "Poor";
end

%% =========================================================
% APPROVAL LOGIC
%% =========================================================

approval.distributionApproved = approval.KS_passRate >= 95;
approval.correlationApproved = corrError < 0.05;

approval.finalApproval = approval.distributionApproved & ...
                         approval.correlationApproved;

%% =========================================================
% FLAG PROBLEM VARIABLES
%% =========================================================

badVars = varsClean(ksClean < 0.05);

if isempty(badVars)
    approval.problemVariables = "None";
else
    approval.problemVariables = badVars;
end

%% =========================================================
% RESEARCH INTERPRETATION TEXT
%% =========================================================

% approval.explanation = sprintf([ ...
% "KS test compares real vs synthetic distributions.\n" ...
% "Mean KS p-value = %.3f\n" ...
% "Pass rate = %.1f%% variables preserved\n" ...
% "Distribution quality = %s\n" ...
% "Correlation error = %.4f\n\n" ...
% "Interpretation:\n" ...
% "- p > 0.05 → synthetic matches real distribution\n" ...
% "- p < 0.05 → distribution drift present\n"], ...
% approval.KS_mean,...
% approval.KS_passRate,...
% approval.KS_quality,...
% corrError);
approval.explanation = sprintf( ...
    ['KS test compares real vs synthetic distributions.\n' ...
     'Mean KS p-value = %.3f\n' ...
     'Pass rate = %.1f%% variables preserved\n' ...
     'Distribution quality = %s\n' ...
     'Correlation error = %.4f\n\n' ...
     'Interpretation:\n' ...
     '- p > 0.05 -> synthetic matches real distribution\n' ...
     '- p < 0.05 -> distribution drift present\n'], ...
     approval.KS_mean,...
     approval.KS_passRate,...
     char(approval.KS_quality),...
     corrError);
%% =========================================================
% PRINT REPORT (FLAG CONTROLLED)
%% =========================================================

if explainFlag

    fprintf('\n--- KS DISTRIBUTION CHECK ---\n')
    fprintf('Mean KS p-value: %.3f\n',approval.KS_mean)
    fprintf('Pass rate: %.1f%%\n',approval.KS_passRate)
    fprintf('Quality: %s\n',approval.KS_quality)

    fprintf('\n--- CORRELATION CHECK ---\n')
    fprintf('Correlation error: %.4f\n',corrError)

    fprintf('\n--- FINAL DECISION ---\n')

    if approval.finalApproval
        fprintf('✓ AUGMENTATION APPROVED\n')
        fprintf('Synthetic data preserves real distribution.\n')
    else
        fprintf('✗ AUGMENTATION REJECTED\n')
    end

    if ~strcmp(approval.problemVariables,"None")
        fprintf('\nVariables with drift:\n')
        disp(approval.problemVariables)
    end

    fprintf('\n--- INTERPRETATION ---\n')
    fprintf('%s\n',approval.explanation)

end

end