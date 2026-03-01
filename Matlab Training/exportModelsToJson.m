function exportModelsToJson(results, filename)
% exportModelsToJson Extracts model parameters and saves them to a standard format.
%   It saves simple model weights/coefficients to a JSON file (readable by Python),
%   and saves the entire `results.models` bundle to a native .mat file since 
%   complex models like neural networks and bagged trees cannot be easily serialized to JSON.

    if nargin < 2
        filename = 'exported_models.json';
    end
    
    if nargin < 1 || ~isfield(results, 'models')
        error('The "results" struct with a "models" field must be provided as the first argument.');
    end
    
    exportData = struct();
    
    % Linear Model
    if isfield(results.models, 'linear') && ~isempty(results.models.linear)
        exportData.linear = struct();
        exportData.linear.Coefficients = results.models.linear.Coefficients.Estimate;
        exportData.linear.VariableNames = results.models.linear.VariableNames;
    end
    
    % Robust Model
    if isfield(results.models, 'robust') && ~isempty(results.models.robust)
        exportData.robust = struct();
        exportData.robust.Coefficients = results.models.robust.Coefficients.Estimate;
    end
    
    % Ridge
    if isfield(results.models, 'Ridge')
        exportData.Ridge = results.models.Ridge;
    end
    
    % Lasso
    if isfield(results.models, 'Lasso')
        exportData.Lasso = results.models.Lasso;
    end
    
    % ElasticNet
    if isfield(results.models, 'ElasticNet')
        exportData.ElasticNet = results.models.ElasticNet;
    end

    % Tree Export
    if isfield(results.models, 'tree') && ~isempty(results.models.tree)
        t = results.models.tree;
        treeData = struct();
        treeData.CutPredictor = t.CutPredictor;
        treeData.CutPoint = t.CutPoint;
        treeData.Children = t.Children;
        treeData.NodeMean = t.NodeMean;
        treeData.IsBranchNode = t.IsBranchNode;
        exportData.Tree = treeData;
    end

    % For XGBoost, DNN, native MATLAB objects cannot be directly JSON encoded.
    % We will save the entire results struct as a .mat file for robust usage,
    % and a JSON for the simpler weights and trees.
    
    % Write to JSON
    try
        jsonStr = jsonencode(exportData);
        fid = fopen(filename, 'w');
        if fid == -1
            error('Cannot open file for writing');
        end
        fprintf(fid, '%s\n', jsonStr);
        fclose(fid);
        fprintf('Saved exportable model parameters to JSON: %s\n', filename);
    catch ME
        fprintf('Error saving JSON: %s\n', ME.message);
    end
    
    % Save as .mat file (most robust for MATLAB models)
    try
        % Replace .json with .mat or append .mat if it doesn't have .json
        if endsWith(filename, '.json')
            matFilename = strrep(filename, '.json', '.mat');
        else
            matFilename = [filename, '.mat'];
        end
        models = results.models;
        save(matFilename, 'models');
        fprintf('Saved full MATLAB models to standard .mat file: %s\n', matFilename);
    catch ME
        fprintf('Error saving MAT: %s\n', ME.message);
    end
end
