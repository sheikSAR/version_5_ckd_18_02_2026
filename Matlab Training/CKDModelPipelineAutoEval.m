function [results, finalModel] = CKDModelPipelineAutoEval(X,y,saveFile)
% CKDModelPipelineAutoEval - Train CKD models and automatically evaluate each
%
% Inputs:
%   X        -> predictor matrix (numeric or table)
%   y        -> target EGFR or CKD outcome
%   saveFile -> optional, filename to save final model (.mat)
%
% Outputs:
%   results    -> struct with models, metrics, feature importance, ensemble, evaluation
%   finalModel -> final model selected for production

if nargin < 3
    saveFile = '';
end

fprintf('\n========== TRAINING ALL MODELS ==========\n');
% ---------------- Train all models -----------------
results = trainCKDModelsExhaustive(X,y);

% ---------------- Visualization of performance -----------------
plotCKDModelPerformance(results.metrics);

% ---------------- Automatic explanation -----------------
explainCKDModels(results.metrics);
% ---------------- Evaluate each model safely -----------------
evalStruct = struct;
modelNames = fieldnames(results.models);
for i = 1:length(modelNames)
    modelName = modelNames{i};
    
    % Initialize pred
    pred = [];
    
    % Ensemble
    if strcmp(modelName,'Ensemble')
        % Recompute ensemble predictions as average of all individual models
        predMat = [];
        for m = fieldnames(results.models)'
            mdlName = m{1};
            mdl = results.models.(mdlName);
            % Only include numeric or object predictions
            if isa(mdl,'LinearModel') || isa(mdl,'CompactRegressionTree') || isa(mdl,'RegressionTree')
                predMat = [predMat predict(mdl,X)];
            elseif isnumeric(mdl)
                if size(mdl,1) == size(X,2)+1
                    predMat = [predMat [ones(size(X,1),1) X]*mdl];
                else
                    predMat = [predMat X*mdl];
                end
            elseif isa(mdl,'network')
                p = predict(mdl,double(squeeze(X)));
                predMat = [predMat p(:)];
            end
        end
        pred = mean(predMat,2); % ensemble as average
    elseif isfield(results.models, modelName)
        mdl = results.models.(modelName);
        if isa(mdl,'LinearModel') || isa(mdl,'CompactRegressionTree') || isa(mdl,'RegressionTree')
            pred = predict(mdl,X);
        elseif isnumeric(mdl) % Ridge/Lasso/ElasticNet
            if strcmp(modelName,'Ridge')
                pred = [ones(size(X,1),1) X]*mdl;
            else
                pred = X*mdl; % ensure intercept included if needed
            end
        elseif isa(mdl,'network')
            pred = predict(mdl,double(squeeze(X)));
            pred = pred(:);
        end
    end
    
    % Safety check
    if isempty(pred)
        warning('Predictions for %s could not be computed, skipping.', modelName);
        continue;
    end
    if length(pred) ~= length(y)
        % Resize or throw error
        error('Prediction length mismatch for %s: %d vs %d', modelName, length(pred), length(y));
    end
    
    % Evaluate predictions
    evalStruct.(modelName) = evaluateCKDModel(y, pred);
end

results.evaluation = evalStruct;
% % ---------------- Evaluate each model -----------------
% fprintf('\n========== AUTOMATIC MODEL EVALUATION ==========\n');
% modelNames = results.metrics.Model;
% evalStruct = struct;
% 
% for i = 1:length(modelNames)
%     modelName = modelNames{i};
% 
%     % Get predictions
%     if strcmp(modelName,'Ensemble')
%         pred = results.ensemble;
%     else
%         mdl = results.models.(modelName);
%         % Linear / tree / regression
%         if isa(mdl,'LinearModel') || isa(mdl,'CompactRegressionTree')
%             pred = predict(mdl,X);
%         elseif isnumeric(mdl) % Ridge / Lasso / ElasticNet
%             if strcmp(modelName,'Ridge')
%                 pred = [ones(size(X,1),1) X]*mdl;
%             else
%                 pred = X*mdl + 0; % lasso / elasticNet, intercept included in training
%             end
%         elseif isa(mdl,'network') % DNN
%             pred = predict(mdl,X);
%         else
%             warning('Unknown model type for %s', modelName)
%             continue
%         end
%     end
% 
%     % Evaluate predictions
%     evalStruct.(modelName) = evaluateCKDModel(y, pred);
% end
% 
% results.evaluation = evalStruct;

% ----------------- Select final model -----------------
% Default: Ensemble if available
if any(strcmp(results.metrics.Model,'Ensemble'))
    finalModel.Name = 'Ensemble';
    finalModel.PredictFcn = @(Xnew) results.ensemble; 
else
    [~, idx] = min(results.metrics.RMSE);
    bestModelName = results.metrics.Model(idx);
    finalModel.Name = bestModelName;
    finalModel.PredictFcn = @(Xnew) predict(results.models.(bestModelName), Xnew);
end

% ----------------- Automatic conclusion -----------------
[~, bestIdx] = min(results.metrics.RMSE);
bestModelName = results.metrics.Model(bestIdx);
bestR2 = results.metrics.R2(bestIdx);
bestRMSE = results.metrics.RMSE(bestIdx);

fprintf('\n========== FINAL CONCLUSION ==========\n');
fprintf('Best model for CKD prediction: %s\n', bestModelName);
fprintf('RMSE = %.3f, R^2 = %.3f\n', bestRMSE, bestR2);
if strcmp(bestModelName,'Ensemble')
    fprintf('→ Use the ensemble model for production (robust & low variance).\n');
else
    fprintf('→ Use %s for production. Ensemble optional for robustness.\n', bestModelName);
end

% ----------------- Save final model -----------------
if ~isempty(saveFile)
    fprintf('Saving final model to: %s\n', saveFile);
    save(saveFile,'finalModel','results');
end

fprintf('\n✓ CKD pipeline with automatic evaluation complete.\n');
end