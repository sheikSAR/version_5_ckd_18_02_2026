function explainCKDModels(metrics)
% EXPLAINCKDMODELS - Generates textual explanation for model performances
%
% INPUT:
%   metrics → table with columns: Model, RMSE, R2

fprintf('\n========== CKD MODEL EXPLANATIONS ==========\n');

rmseVals = metrics.RMSE;
R2Vals = metrics.R2;
[~,bestIdx] = min(rmseVals);

for i = 1:height(metrics)
    modelName = metrics.Model(i);
    rmse = rmseVals(i);
    R2val = R2Vals(i);
    
    fprintf('\nModel: %s\n', modelName);
    fprintf(' - RMSE: %.3f\n', rmse);
    fprintf(' - R^2 : %.3f\n', R2val);
    
    % Automatic interpretation
    if strcmp(modelName,'Ensemble')
        fprintf(' → Ensemble combines all models and achieves the best performance.\n');
    elseif R2val > 0.95
        fprintf(' → Excellent fit, likely captures most variance in the data.\n');
    elseif R2val > 0.9
        fprintf(' → Good fit, captures main trends.\n');
    elseif R2val > 0.8
        fprintf(' → Moderate fit, may miss some nonlinearities.\n');
    else
        fprintf(' → Poor fit, likely underfitting or inappropriate model.\n');
    end
    
    % Compare to best model
    if i ~= bestIdx
        diff = rmse - rmseVals(bestIdx);
        fprintf(' → RMSE is %.3f higher than best model (%s).\n', diff, metrics.Model(bestIdx));
    else
        fprintf(' → This is the best single model by RMSE.\n');
    end
end

fprintf('\n✓ Explanation generation complete.\n');
end